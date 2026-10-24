import { describe, expect, it, vi } from 'vitest';
import type { KeboolaProject } from '../system/keboola.ts';
import { runSetupChecks, type SetupInput, type SetupStep } from './checks.ts';

const project = (alias: string, isDefault = false): KeboolaProject => ({ alias, name: alias.toUpperCase(), id: 1, stackUrl: 'https://connection.example', isDefault });

function input(overrides: Partial<SetupInput> = {}): SetupInput {
  return {
    omniroute: { baseUrl: 'http://omni/v1', apiKey: 'sk-key-123456', model: 'cc/model' },
    keboolaProject: 'sandbox',
    probeOmniRoute: async () => ({ reachable: true, status: 200, models: ['cc/model', 'other'] }),
    testModel: async () => ({ ok: true, model: 'cc/model', latencyMs: 420 }),
    kbagentVersion: async () => 'kbagent v0.100.2',
    keboolaProjects: async () => [project('sandbox', true), project('prod')],
    ...overrides,
  };
}

const step = (steps: readonly SetupStep[], id: SetupStep['id']) => steps.find((entry) => entry.id === id);

describe('runSetupChecks', () => {
  it('passes every step when OmniRoute, the model, kbagent and the project are ready', async () => {
    const result = await runSetupChecks(input());
    expect(result.complete).toBe(true);
    expect(result.steps).toEqual([
      { id: 'omniroute', status: 'ok', detail: '2 models at http://omni/v1' },
      { id: 'apiKey', status: 'ok', detail: 'set and accepted' },
      { id: 'model', status: 'ok', detail: 'cc/model answered in 420 ms' },
      { id: 'kbagent', status: 'ok', detail: 'kbagent v0.100.2' },
      { id: 'projects', status: 'ok', detail: '2 registered: sandbox, prod' },
      { id: 'project', status: 'ok', detail: 'sandbox' },
    ]);
    expect(result.models).toEqual(['cc/model', 'other']);
    expect(result.projects.map((entry) => entry.alias)).toEqual(['sandbox', 'prod']);
  });

  it('blocks the key and model steps while OmniRoute is down, without testing the model', async () => {
    const testModel = vi.fn(async () => ({ ok: true, model: 'cc/model', latencyMs: 1 }));
    const { steps, complete } = await runSetupChecks(input({ probeOmniRoute: async () => ({ reachable: false, error: 'ECONNREFUSED' }), testModel }));

    expect(complete).toBe(false);
    expect(step(steps, 'omniroute')).toEqual({ id: 'omniroute', status: 'fail', reason: 'unreachable', detail: 'not reachable at http://omni/v1 (ECONNREFUSED)' });
    expect(step(steps, 'apiKey')).toMatchObject({ status: 'blocked' });
    expect(step(steps, 'model')).toMatchObject({ status: 'blocked' });
    expect(testModel).not.toHaveBeenCalled();
  });

  it('separates a router error from a missing or rejected key', async () => {
    const broken = await runSetupChecks(input({ probeOmniRoute: async () => ({ reachable: true, status: 500, models: [] }) }));
    expect(step(broken.steps, 'omniroute')).toMatchObject({ status: 'fail', reason: 'http', detail: 'http://omni/v1/models answered HTTP 500' });

    const rejected = await runSetupChecks(input({ probeOmniRoute: async () => ({ reachable: true, status: 401, models: [] }) }));
    expect(step(rejected.steps, 'omniroute')).toMatchObject({ status: 'ok', detail: 'running at http://omni/v1' });
    expect(step(rejected.steps, 'apiKey')).toMatchObject({ status: 'fail', reason: 'keyRejected', detail: 'rejected by OmniRoute (HTTP 401)' });
    expect(step(rejected.steps, 'model')).toMatchObject({ status: 'blocked' });

    const missing = await runSetupChecks(input({ omniroute: { baseUrl: 'http://omni/v1', apiKey: '', model: 'cc/model' } }));
    expect(step(missing.steps, 'apiKey')).toMatchObject({ status: 'fail', reason: 'keyMissing', detail: 'not set' });
  });

  it('asks for a model, and reports one that does not answer', async () => {
    const unset = await runSetupChecks(input({ omniroute: { baseUrl: 'http://omni/v1', apiKey: 'k', model: '' } }));
    expect(step(unset.steps, 'model')).toMatchObject({ status: 'fail', reason: 'modelMissing', detail: 'not chosen' });

    const failing = await runSetupChecks(input({ testModel: async () => ({ ok: false, model: 'cc/model', latencyMs: 9, error: 'HTTP 404: unknown model' }) }));
    expect(step(failing.steps, 'model')).toMatchObject({ status: 'fail', reason: 'modelFailed', detail: 'cc/model: HTTP 404: unknown model' });
  });

  it('blocks the Keboola steps without kbagent', async () => {
    const { steps } = await runSetupChecks(
      input({
        kbagentVersion: async () => {
          throw new Error('not installed or not on PATH');
        },
        keboolaProjects: async () => {
          throw new Error('kbagent project list failed');
        },
      }),
    );
    expect(step(steps, 'kbagent')).toEqual({ id: 'kbagent', status: 'fail', reason: 'kbagentMissing', detail: 'not installed or not on PATH' });
    expect(step(steps, 'projects')).toMatchObject({ status: 'blocked' });
    expect(step(steps, 'project')).toMatchObject({ status: 'blocked' });
  });

  it('asks to connect a project when kbagent has none, and reports when it cannot list them', async () => {
    const none = await runSetupChecks(input({ keboolaProjects: async () => [] }));
    expect(step(none.steps, 'projects')).toMatchObject({ status: 'fail', reason: 'projectsNone', detail: 'none registered' });
    expect(step(none.steps, 'project')).toMatchObject({ status: 'blocked' });

    const failing = await runSetupChecks(
      input({
        keboolaProjects: async () => {
          throw new Error('kbagent project list failed (exit 5)');
        },
      }),
    );
    expect(step(failing.steps, 'projects')).toMatchObject({ status: 'fail', reason: 'projectsFailed', detail: 'kbagent project list failed (exit 5)' });
  });

  it('accepts kbagent default or only project when none is configured', async () => {
    const byDefault = await runSetupChecks(input({ keboolaProject: '' }));
    expect(step(byDefault.steps, 'project')).toMatchObject({ status: 'ok', detail: 'sandbox (kbagent default)' });

    const only = await runSetupChecks(input({ keboolaProject: '', keboolaProjects: async () => [project('solo')] }));
    expect(step(only.steps, 'project')).toMatchObject({ status: 'ok', detail: 'solo (the only one)' });
  });

  it('asks to choose among several projects or to replace one kbagent does not know', async () => {
    const several = await runSetupChecks(input({ keboolaProject: '', keboolaProjects: async () => [project('a'), project('b')] }));
    expect(step(several.steps, 'project')).toMatchObject({ status: 'fail', reason: 'projectMissing', detail: 'not chosen' });

    const unknown = await runSetupChecks(input({ keboolaProject: 'gone' }));
    expect(step(unknown.steps, 'project')).toMatchObject({ status: 'fail', reason: 'projectUnknown', detail: 'gone is not registered in kbagent' });
  });

  it('never puts the key into any step', async () => {
    const key = 'sk-very-secret-key-000';
    const result = await runSetupChecks(
      input({
        omniroute: { baseUrl: 'http://omni/v1', apiKey: key, model: 'm' },
        testModel: async () => ({ ok: false, model: 'm', latencyMs: 1, error: `bad ${key}` }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain(key);
  });
});
