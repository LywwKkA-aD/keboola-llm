import type { InterruptOnConfig } from 'langchain';
import type { AgentDefinition } from '../registry/types.ts';
import type { ToolFactory } from './catalog.ts';
import { createKbagentSqlTool, createKbagentTools } from './kbagent/index.ts';

const NO_APPROVALS: Readonly<Record<string, InterruptOnConfig>> = {};
const WRITE_APPROVAL: Readonly<Record<string, InterruptOnConfig>> = {
  kbagent_write: { allowedDecisions: ['approve', 'reject'] },
};
// The run manager may answer this one itself when the user allowed SQL for the chat.
const SQL_APPROVAL: Readonly<Record<string, InterruptOnConfig>> = {
  kbagent_sql: { allowedDecisions: ['approve', 'reject'] },
};

/** Project and branch an agent's kbagent tools are pinned to. */
function scopeOf(agent: AgentDefinition, defaultProject: string) {
  const project = agent.keboola?.project || defaultProject || undefined;
  return {
    ...(project ? { project } : {}),
    ...(agent.keboola?.branch ? { branch: agent.keboola.branch } : {}),
  };
}

/** Every tool id an AGENT.md may list in `tools`, mapped to its factory. */
export function createToolFactories({ defaultProject }: { defaultProject: string }): Readonly<Record<string, ToolFactory>> {
  return {
    kbagent: (agent) => {
      const access = agent.keboola?.access ?? 'read';
      const tools = createKbagentTools({ access, ...scopeOf(agent, defaultProject) });
      return { tools, interruptOn: access === 'write' ? WRITE_APPROVAL : NO_APPROVALS };
    },
    'kbagent-sql': (agent) => ({
      tools: [createKbagentSqlTool(scopeOf(agent, defaultProject))],
      interruptOn: SQL_APPROVAL,
    }),
  };
}
