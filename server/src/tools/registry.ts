import type { InterruptOnConfig } from 'langchain';
import type { AgentDefinition } from '../registry/types.ts';
import type { ToolFactory } from './catalog.ts';
import { createKbagentPromoteTool, createKbagentSqlTool, createKbagentTools, PROMOTE_TOOL } from './kbagent/index.ts';
import { createPlanApprovalTool, PLAN_TOOL } from './plan.ts';

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
export function createToolFactories({ defaultProject, changePath }: {
  defaultProject: string;
  /** How changes reach production for this analyst (system/keboola-access.ts); unknown until read. */
  changePath?: 'promote' | 'merge-request' | 'keboola-ui' | 'read-only';
}): Readonly<Record<string, ToolFactory>> {
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
    // The only way to production: the user approves each promotion after seeing it; never auto-approved.
    'kbagent-promote': (agent) =>
      agent.keboola?.access === 'write' && (changePath === undefined || changePath === 'promote')
        ? { tools: [createKbagentPromoteTool(scopeOf(agent, defaultProject))], interruptOn: { [PROMOTE_TOOL]: { allowedDecisions: ['approve', 'reject'] } } }
        : { tools: [], interruptOn: NO_APPROVALS },
    // Never auto-approved: agreeing a plan is the user's decision.
    'plan-approval': () => ({
      tools: [createPlanApprovalTool()],
      interruptOn: { [PLAN_TOOL]: { allowedDecisions: ['approve', 'reject'] } },
    }),
  };
}
