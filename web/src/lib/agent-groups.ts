import type { AgentInfo } from '../api/types.ts';

export type AgentGroup = 'lead' | 'keboola' | 'reviewers' | 'knowledge' | 'disabled';

export const GROUP_ORDER: readonly AgentGroup[] = ['lead', 'keboola', 'reviewers', 'knowledge', 'disabled'];

const REVIEWER = /reviewer|auditor|consolidator|readiness|optimizer/;

/** Where an agent shows up in the team panel. */
export function groupOf(agent: AgentInfo): AgentGroup {
  if (!agent.enabled) return 'disabled';
  if (agent.role === 'orchestrator') return 'lead';
  if (REVIEWER.test(agent.name)) return 'reviewers';
  if (agent.tools.some((tool) => tool.startsWith('kbagent'))) return 'keboola';
  return 'knowledge';
}

export interface GroupedAgents {
  readonly group: AgentGroup;
  readonly agents: readonly AgentInfo[];
}

/** Agents by group in display order, alphabetical inside a group, without empty groups. */
export function groupTeam(agents: readonly AgentInfo[]): GroupedAgents[] {
  return GROUP_ORDER.map((group) => ({
    group,
    agents: agents.filter((agent) => groupOf(agent) === group).toSorted((a, b) => a.name.localeCompare(b.name)),
  })).filter((entry) => entry.agents.length > 0);
}
