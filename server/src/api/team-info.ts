import type { AgentDefinition, LoadError, SkillInfo } from '../registry/types.ts';
import type { AgentInfo, TeamInfo } from './types.ts';

const toAgentInfo = (agent: AgentDefinition): AgentInfo => ({
  name: agent.name,
  description: agent.description,
  role: agent.role,
  enabled: agent.enabled,
  skills: agent.skills,
  tools: agent.tools,
  ...(agent.keboola ? { access: agent.keboola.access } : {}),
  ...(agent.avatar ? { avatar: agent.avatar } : {}),
  ...(agent.basedOn ? { basedOn: agent.basedOn } : {}),
});

/** Public description of the team for the UI: no prompts, no absolute paths. */
export function describeTeam({ lead, agents, skills, warnings, loadErrors }: {
  lead: string;
  agents: readonly AgentDefinition[];
  skills: readonly SkillInfo[];
  warnings: readonly string[];
  loadErrors: readonly LoadError[];
}): TeamInfo {
  return {
    lead,
    agents: agents.map(toAgentInfo),
    skills: skills.map((skill) => ({ name: skill.name, description: skill.description, source: skill.sourceId })),
    warnings,
    loadErrors,
  };
}
