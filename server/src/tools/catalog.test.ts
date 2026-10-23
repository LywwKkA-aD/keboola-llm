import { tool } from '@langchain/core/tools';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AgentDefinition } from '../registry/types.ts';
import { createToolResolver } from './catalog.ts';

const fakeTool = (name: string) => tool(async () => 'ok', { name, description: `${name} tool`, schema: z.object({}) });

const agent = (tools: string[]): AgentDefinition =>
  ({ name: 'a', description: 'An agent for tests.', role: 'subagent', enabled: true, skills: [], tools, writes: [], approve: [], prompt: '', file: '' }) as AgentDefinition;

describe('createToolResolver', () => {
  const resolve = createToolResolver({
    alpha: () => ({ tools: [fakeTool('alpha_read')], interruptOn: {} }),
    beta: () => ({ tools: [fakeTool('beta_write')], interruptOn: { beta_write: { allowedDecisions: ['approve', 'reject'] } } }),
  });

  it('merges the bundles of every tool id the agent declares', () => {
    const bundle = resolve(agent(['alpha', 'beta']));
    expect(bundle.tools.map((t) => t.name)).toEqual(['alpha_read', 'beta_write']);
    expect(Object.keys(bundle.interruptOn)).toEqual(['beta_write']);
    expect(bundle.unknown).toEqual([]);
  });

  it('reports unknown tool ids instead of failing', () => {
    const bundle = resolve(agent(['alpha', 'nope']));
    expect(bundle.tools.map((t) => t.name)).toEqual(['alpha_read']);
    expect(bundle.unknown).toEqual(['nope']);
  });

  it('returns an empty bundle for an agent without tools', () => {
    expect(resolve(agent([]))).toEqual({ tools: [], interruptOn: {}, unknown: [] });
  });
});
