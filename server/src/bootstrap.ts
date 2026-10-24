import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { type AppEnv, type OmniRouteConfig, readAppEnv } from './config/env.ts';
import { loadSettings, type Settings } from './config/settings.ts';
import { createModelFactory } from './llm/model.ts';
import { loadAgents } from './registry/agents.ts';
import { discoverSkillSources, loadSkills } from './registry/skills.ts';
import type { AgentDefinition, LoadError, SkillInfo } from './registry/types.ts';
import { createBackend } from './runtime/backend.ts';
import { buildTeamSpec, createTeam, type TeamSpec } from './runtime/team.ts';
import { createToolResolver } from './tools/catalog.ts';
import { createToolFactories } from './tools/registry.ts';

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface App {
  readonly env: AppEnv;
  readonly checkpointer: SqliteSaver;
  readonly settingsFile: string;
  readonly agents: readonly AgentDefinition[];
  readonly skills: readonly SkillInfo[];
  readonly loadErrors: readonly LoadError[];
  readonly loadSettings: () => Settings;
  readonly buildTeam: (settings: Settings) => Team;
  /** Re-read agents and skills from disk; the next buildTeam uses them. */
  readonly reloadDefinitions: () => void;
  /** The .env file config came from: ENV_FILE, else <root>/.env. The setup wizard saves the OmniRoute key here. */
  readonly envFile: string;
  /** Use new OmniRoute settings from now on (the setup wizard's key form); the next buildTeam uses them. */
  readonly setOmniRoute: (omniroute: OmniRouteConfig) => void;
}

/** Model and Keboola project actually in use: settings override .env, empty means .env. */
export interface Effective {
  readonly model: string;
  readonly keboolaProject: string;
}

export interface Team {
  readonly spec: TeamSpec;
  readonly graph: ReturnType<typeof createTeam>;
  readonly effective: Effective;
}

function loadDotEnv(file: string): void {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Read config, agents and skills from disk and prepare everything needed to build the team. */
export function bootstrap(rootDir: string = ROOT_DIR): App {
  const envFile = (process.env.ENV_FILE ?? '').trim() || join(rootDir, '.env');
  loadDotEnv(envFile);
  let env = readAppEnv(process.env, rootDir);
  mkdirSync(env.dataDir, { recursive: true });

  const skillSources = discoverSkillSources(rootDir);
  const readDefinitions = () => ({ agents: loadAgents(rootDir), skills: loadSkills(skillSources) });
  let definitions = readDefinitions();
  const settingsFile = join(env.dataDir, 'settings.json');

  const checkpointer = SqliteSaver.fromConnString(join(env.dataDir, 'checkpoints.sqlite'));
  const backend = createBackend({ rootDir, dataDir: env.dataDir, skillSources });
  let createModel = createModelFactory(env.omniroute);

  return {
    get env() {
      return env;
    },
    envFile,
    setOmniRoute: (omniroute) => {
      env = { ...env, omniroute };
      createModel = createModelFactory(omniroute);
    },
    checkpointer,
    settingsFile,
    get agents() {
      return definitions.agents.items;
    },
    get skills() {
      return definitions.skills.items;
    },
    get loadErrors() {
      return [...definitions.agents.errors, ...definitions.skills.errors];
    },
    loadSettings: () => loadSettings(settingsFile),
    reloadDefinitions: () => {
      definitions = readDefinitions();
    },
    buildTeam: (settings) => {
      const { agents, skills } = definitions;
      const effective = { model: settings.model || env.omniroute.model, keboolaProject: settings.keboolaProject || env.keboolaProject };
      const resolveTools = createToolResolver(createToolFactories({ defaultProject: effective.keboolaProject }));
      const spec = buildTeamSpec({ agents: agents.items, skills: skills.items, language: settings.language, resolveTools });
      // Agents without their own model use the effective default instead of the .env one.
      const modelFor = (modelId?: string) => createModel(modelId ?? effective.model);
      return { spec, graph: createTeam({ spec, createModel: modelFor, backend, checkpointer }), effective };
    },
  };
}
