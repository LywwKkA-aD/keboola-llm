import type { StructuredTool } from '@langchain/core/tools';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { type AnyBackendProtocol, createDeepAgent, type FilesystemPermission } from 'deepagents';
import type { InterruptOnConfig } from 'langchain';
import { buildOrchestratorPrompt, buildSubagentPrompt } from '../prompts/compose.ts';
import type { LanguageCode } from '../prompts/language.ts';
import type { AgentDefinition, SkillInfo } from '../registry/types.ts';
import type { ToolResolver } from '../tools/catalog.ts';
import { MEMORY_FILE, permissionsFor, skillPath } from './paths.ts';

export interface AgentSpec {
  readonly name: string;
  readonly description: string;
  readonly systemPrompt: string;
  readonly tools: readonly StructuredTool[];
  readonly skills: readonly string[];
  readonly permissions: FilesystemPermission[];
  readonly interruptOn: Readonly<Record<string, InterruptOnConfig>>;
  readonly model?: string;
}

export interface TeamSpec {
  readonly lead: AgentSpec;
  readonly subagents: readonly AgentSpec[];
  readonly warnings: readonly string[];
}

interface SpecInput {
  readonly agents: readonly AgentDefinition[];
  readonly skills: readonly SkillInfo[];
  readonly language: LanguageCode;
  /** What the analyst may do in Keboola, for every agent's prompt; absent until the app has read it. */
  readonly access?: string;
  readonly resolveTools: ToolResolver;
}

const APPROVAL: InterruptOnConfig = { allowedDecisions: ['approve', 'reject'] };

/** Pure description of the team: prompts, tools, skills, permissions and approvals for every agent. */
export function buildTeamSpec({ agents, skills, language, resolveTools, access }: SpecInput): TeamSpec {
  const lead = agents.find((agent) => agent.enabled && agent.role === 'orchestrator');
  if (!lead) throw new Error('No enabled orchestrator agent found in agents/');

  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const toSpec = (agent: AgentDefinition, systemPrompt: string) => {
    const resolved = resolveTools(agent);
    const missing = agent.skills.filter((name) => !byName.has(name));
    const spec: AgentSpec = {
      name: agent.name,
      description: agent.description,
      systemPrompt,
      tools: resolved.tools,
      skills: agent.skills.flatMap((name) => {
        const skill = byName.get(name);
        return skill ? [skillPath(skill)] : [];
      }),
      permissions: permissionsFor(agent.writes),
      interruptOn: { ...resolved.interruptOn, ...Object.fromEntries(agent.approve.map((name) => [name, APPROVAL])) },
      ...(agent.model ? { model: agent.model } : {}),
    };
    const warnings = [
      ...missing.map((name) => `${agent.name}: unknown skill "${name}"`),
      ...resolved.unknown.map((id) => `${agent.name}: unknown tool "${id}"`),
    ];
    return { spec, warnings };
  };

  const leadResult = toSpec(lead, buildOrchestratorPrompt({ agentPrompt: lead.prompt, language, ...(access ? { access } : {}) }));
  const subResults = agents
    .filter((agent) => agent.enabled && agent.role === 'subagent')
    .map((agent) => toSpec(agent, buildSubagentPrompt({ agentPrompt: agent.prompt, ...(access ? { access } : {}) })));

  return {
    lead: leadResult.spec,
    subagents: subResults.map((result) => result.spec),
    warnings: [leadResult, ...subResults].flatMap((result) => result.warnings),
  };
}

interface TeamInput {
  readonly spec: TeamSpec;
  readonly createModel: (modelId?: string) => BaseChatModel;
  readonly backend: AnyBackendProtocol;
  readonly checkpointer: BaseCheckpointSaver;
}

/** Instantiate the deep agent graph for a team spec. */
export function createTeam({ spec, createModel, backend, checkpointer }: TeamInput) {
  const { lead, subagents } = spec;
  return createDeepAgent({
    name: lead.name,
    model: createModel(lead.model),
    systemPrompt: lead.systemPrompt,
    tools: [...lead.tools],
    skills: [...lead.skills],
    memory: [MEMORY_FILE],
    permissions: lead.permissions,
    interruptOn: { ...lead.interruptOn },
    backend,
    checkpointer,
    subagents: subagents.map((agent) => ({
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      tools: [...agent.tools],
      skills: [...agent.skills],
      permissions: agent.permissions,
      interruptOn: { ...agent.interruptOn },
      ...(agent.model ? { model: createModel(agent.model) } : {}),
    })),
  });
}
