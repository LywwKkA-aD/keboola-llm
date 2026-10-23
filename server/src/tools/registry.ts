import type { InterruptOnConfig } from 'langchain';
import type { ToolFactory } from './catalog.ts';
import { createKbagentTools } from './kbagent/index.ts';

const NO_APPROVALS: Readonly<Record<string, InterruptOnConfig>> = {};
const WRITE_APPROVAL: Readonly<Record<string, InterruptOnConfig>> = {
  kbagent_write: { allowedDecisions: ['approve', 'reject'] },
};

/** Every tool id an AGENT.md may list in `tools`, mapped to its factory. */
export function createToolFactories({ defaultProject }: { defaultProject: string }): Readonly<Record<string, ToolFactory>> {
  return {
    kbagent: (agent) => {
      const access = agent.keboola?.access ?? 'read';
      const project = agent.keboola?.project || defaultProject || undefined;
      const tools = createKbagentTools({
        access,
        ...(project ? { project } : {}),
        ...(agent.keboola?.branch ? { branch: agent.keboola.branch } : {}),
      });
      return { tools, interruptOn: access === 'write' ? WRITE_APPROVAL : NO_APPROVALS };
    },
  };
}
