import type { StructuredTool } from '@langchain/core/tools';
import type { InterruptOnConfig } from 'langchain';
import type { AgentDefinition } from '../registry/types.ts';

export interface ToolBundle {
  readonly tools: readonly StructuredTool[];
  readonly interruptOn: Readonly<Record<string, InterruptOnConfig>>;
}

export interface ResolvedTools extends ToolBundle {
  readonly unknown: readonly string[];
}

/** Builds the tools for one tool id (e.g. "kbagent"), configured for the given agent. */
export type ToolFactory = (agent: AgentDefinition) => ToolBundle;

export type ToolResolver = (agent: AgentDefinition) => ResolvedTools;

/** Resolve an agent's declared tool ids into concrete tools; unknown ids are reported, not fatal. */
export function createToolResolver(factories: Readonly<Record<string, ToolFactory>>): ToolResolver {
  return (agent) =>
    agent.tools.reduce<ResolvedTools>(
      (acc, id) => {
        const factory = factories[id];
        if (!factory) return { ...acc, unknown: [...acc.unknown, id] };
        const bundle = factory(agent);
        return {
          tools: [...acc.tools, ...bundle.tools],
          interruptOn: { ...acc.interruptOn, ...bundle.interruptOn },
          unknown: acc.unknown,
        };
      },
      { tools: [], interruptOn: {}, unknown: [] },
    );
}
