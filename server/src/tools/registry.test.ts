import { describe, expect, it } from 'vitest';
import type { AgentDefinition } from '../registry/types.ts';
import { createToolFactories } from './registry.ts';

const agent = (keboola?: AgentDefinition['keboola']) =>
  ({ name: 'a', description: 'Agent for tests.', role: 'subagent', enabled: true, skills: [], tools: ['kbagent'], writes: [], approve: [], prompt: '', file: '', ...(keboola ? { keboola } : {}) }) as AgentDefinition;

describe('createToolFactories', () => {
  const factories = createToolFactories({ defaultProject: 'sandbox' });

  it('gives read-only agents only kbagent_read and no approvals', () => {
    const bundle = factories.kbagent?.(agent({ access: 'read' }));
    expect(bundle?.tools.map((tool) => tool.name)).toEqual(['kbagent_read']);
    expect(bundle?.interruptOn).toEqual({});
  });

  it('puts kbagent_write behind human approval for write agents', () => {
    const bundle = factories.kbagent?.(agent({ access: 'write', project: 'other' }));
    expect(bundle?.tools.map((tool) => tool.name)).toEqual(['kbagent_read', 'kbagent_write']);
    expect(bundle?.interruptOn).toEqual({ kbagent_write: { allowedDecisions: ['approve', 'reject'] } });
  });

  it('defaults to read access when the agent has no keboola block', () => {
    expect(factories.kbagent?.(agent()).tools.map((tool) => tool.name)).toEqual(['kbagent_read']);
  });

  it('pins the default project into the tool description', () => {
    const [read] = factories.kbagent?.(agent({ access: 'read' })).tools ?? [];
    expect(read?.description).toContain('sandbox');
  });
});

describe('kbagent-sql tool id', () => {
  const factories = createToolFactories({ defaultProject: 'sandbox' });

  it('produces kbagent_sql behind human approval, independent of the agent access level', () => {
    const bundle = factories['kbagent-sql']?.(agent({ access: 'read' }));
    expect(bundle?.tools.map((tool) => tool.name)).toEqual(['kbagent_sql']);
    expect(bundle?.interruptOn).toEqual({ kbagent_sql: { allowedDecisions: ['approve', 'reject'] } });
  });

  it('pins the project like the other kbagent tools', () => {
    const [sql] = factories['kbagent-sql']?.(agent({ access: 'read', project: 'other' })).tools ?? [];
    expect(sql?.description).toContain('"other"');
  });

  it('offers the plan approval as a tool that always waits for the user', async () => {
    const bundle = factories['plan-approval']?.(agent());
    expect(bundle?.tools.map((tool) => tool.name)).toEqual(['request_plan_approval']);
    expect(bundle?.interruptOn).toEqual({ request_plan_approval: { allowedDecisions: ['approve', 'reject'] } });
    // It only runs once the user approved, so its answer says exactly that.
    const result = await bundle?.tools[0]?.invoke({ title: 'Fix the shipping fan-out', plan: '1. Branch\n2. Edit' });
    expect(String(result)).toMatch(/approved/i);
  });

  it('gives write-capable agents the promotion to production, always behind the user', () => {
    const bundle = factories['kbagent-promote']?.(agent({ access: 'write' }));
    expect(bundle?.tools.map((tool) => tool.name)).toEqual(['kbagent_promote']);
    expect(bundle?.interruptOn).toEqual({ kbagent_promote: { allowedDecisions: ['approve', 'reject'] } });
    // A read-only agent asking for it gets nothing.
    expect(factories['kbagent-promote']?.(agent({ access: 'read' })).tools).toEqual([]);
  });

  it('offers the promotion only where the access allows promoting from the app', () => {
    const write = agent({ access: 'write' });
    const names = (changePath: 'promote' | 'merge-request' | 'keboola-ui' | 'read-only') =>
      createToolFactories({ defaultProject: 'sandbox', changePath })['kbagent-promote']?.(write).tools.map((tool) => tool.name);
    expect(names('promote')).toEqual(['kbagent_promote']);
    expect(names('merge-request')).toEqual([]);
    expect(names('keboola-ui')).toEqual([]);
    expect(names('read-only')).toEqual([]);
  });
});

