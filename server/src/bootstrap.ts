import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { type AppEnv, readAppEnv } from './config/env.ts';
import { loadSettings, type Settings } from './config/settings.ts';
import { createModelFactory } from './llm/model.ts';
import { loadAgents } from './registry/agents.ts';
import { discoverSkillSources, loadSkills } from './registry/skills.ts';
import type { AgentDefinition, LoadError, SkillInfo } from './registry/types.ts';
import { createBackend } from './runtime/backend.ts';
import { buildTeamSpec, createTeam, type TeamSpec } from './runtime/team.ts';
import { createToolResolver, type ToolFactory } from './tools/catalog.ts';

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const TOOL_FACTORIES: Readonly<Record<string, ToolFactory>> = {};

export interface App {
  readonly env: AppEnv;
  readonly settingsFile: string;
  readonly agents: readonly AgentDefinition[];
  readonly skills: readonly SkillInfo[];
  readonly loadErrors: readonly LoadError[];
  readonly loadSettings: () => Settings;
  readonly buildTeam: (settings: Settings) => { spec: TeamSpec; graph: ReturnType<typeof createTeam> };
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
  loadDotEnv(join(rootDir, '.env'));
  const env = readAppEnv(process.env, rootDir);
  mkdirSync(env.dataDir, { recursive: true });

  const agents = loadAgents(rootDir);
  const skillSources = discoverSkillSources(rootDir);
  const skills = loadSkills(skillSources);
  const settingsFile = join(env.dataDir, 'settings.json');

  const checkpointer = SqliteSaver.fromConnString(join(env.dataDir, 'checkpoints.sqlite'));
  const backend = createBackend({ rootDir, dataDir: env.dataDir, skillSources });
  const createModel = createModelFactory(env.omniroute);
  const resolveTools = createToolResolver(TOOL_FACTORIES);

  return {
    env,
    settingsFile,
    agents: agents.items,
    skills: skills.items,
    loadErrors: [...agents.errors, ...skills.errors],
    loadSettings: () => loadSettings(settingsFile),
    buildTeam: (settings) => {
      const spec = buildTeamSpec({ agents: agents.items, skills: skills.items, language: settings.language, resolveTools });
      return { spec, graph: createTeam({ spec, createModel, backend, checkpointer }) };
    },
  };
}
