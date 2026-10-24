import { describe, expect, it, vi } from 'vitest';
import type { KeboolaProject } from '../system/keboola.ts';
import { runSetupChecks, type SetupInput, type SetupStep } from './checks.ts';

const project = (alias: string, isDefault = false): KeboolaProject => ({ alias, name: alias.toUpperCase(), id: 1, stackUrl: 'https://connection.example', isDefault });

function input(overrides: Partial<SetupInput> = {}): SetupInput {
  return {
    omniroute: { baseUrl: 'http://omni/v1', apiKey: 'sk-key-123456', model: 'cc/model' },
    keboolaProject: 'sandbox',
    probeOmniRoute: async () => ({
      reachable: true,
      status: 200,
      models: [
        { id: 'cc/model', provider: 'claude' },
        { id: 'cc/other', provider: 'claude' },
        { id: 'free/model', provider: 'aihorde' },
      ],
    }),
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
    // detail: English for `npm run doctor`; facts: the same, structured, for the UI to put in the user's language.
    expect(result.steps).toEqual([
      // Only the connected provider's models count, not keyless free providers OmniRoute lists too.
      { id: 'omniroute', status: 'ok', detail: '2 models of claude at http://omni/v1', facts: { kind: 'router', url: 'http://omni/v1', models: 2, provider: 'claude' } },
      { id: 'apiKey', status: 'ok', detail: 'set and accepted', facts: { kind: 'keyAccepted' } },
      { id: 'model', status: 'ok', detail: 'cc/model answered in 420 ms', facts: { kind: 'modelAnswered', model: 'cc/model', ms: 420 } },
      { id: 'kbagent', status: 'ok', detail: 'kbagent v0.100.2', facts: { kind: 'version', version: 'kbagent v0.100.2' } },
      { id: 'projects', status: 'ok', detail: '2 registered: sandbox, prod', facts: { kind: 'projects', aliases: ['sandbox', 'prod'] } },
      { id: 'project', status: 'ok', detail: 'sandbox', facts: { kind: 'project', alias: 'sandbox', source: 'configured' } },
    ]);
    expect(result.models).toEqual(['cc/model', 'cc/other']);
    expect(result.projects.map((entry) => entry.alias)).toEqual(['sandbox', 'prod']);
  });

  it('blocks the key and model steps while OmniRoute is down, without testing the model', async () => {
    const testModel = vi.fn(async () => ({ ok: true, model: 'cc/model', latencyMs: 1 }));
    const { steps, complete } = await runSetupChecks(input({ probeOmniRoute: async () => ({ reachable: false, error: 'ECONNREFUSED' }), testModel }));

    expect(complete).toBe(false);
    expect(step(steps, 'omniroute')).toEqual({
      id: 'omniroute',
      status: 'fail',
      reason: 'unreachable',
      detail: 'not reachable at http://omni/v1 (ECONNREFUSED)',
      facts: { kind: 'unreachable', url: 'http://omni/v1', error: 'ECONNREFUSED' },
    });
    expect(step(steps, 'apiKey')).toMatchObject({ status: 'blocked' });
    expect(step(steps, 'apiKey')).not.toHaveProperty('facts');
    expect(step(steps, 'model')).toMatchObject({ status: 'blocked' });
    expect(testModel).not.toHaveBeenCalled();
  });

  it('separates a router error from a missing or rejected key', async () => {
    const broken = await runSetupChecks(input({ probeOmniRoute: async () => ({ reachable: true, status: 500, models: [] }) }));
    expect(step(broken.steps, 'omniroute')).toMatchObject({ status: 'fail', reason: 'http', detail: 'http://omni/v1/models answered HTTP 500', facts: { kind: 'http', url: 'http://omni/v1/models', status: 500 } });

    const rejected = await runSetupChecks(input({ probeOmniRoute: async () => ({ reachable: true, status: 401, models: [] }) }));
    expect(step(rejected.steps, 'omniroute')).toMatchObject({ status: 'ok', detail: 'running at http://omni/v1', facts: { kind: 'router', url: 'http://omni/v1' } });
    expect(step(rejected.steps, 'omniroute')?.facts).not.toHaveProperty('models');
    expect(step(rejected.steps, 'apiKey')).toMatchObject({ status: 'fail', reason: 'keyRejected', detail: 'rejected by OmniRoute (HTTP 401)', facts: { kind: 'keyRejected', status: 401 } });
    expect(step(rejected.steps, 'model')).toMatchObject({ status: 'blocked' });

    const missing = await runSetupChecks(input({ omniroute: { baseUrl: 'http://omni/v1', apiKey: '', model: 'cc/model' } }));
    // The reason says it all; nothing more to show.
    expect(step(missing.steps, 'apiKey')).toMatchObject({ status: 'fail', reason: 'keyMissing', detail: 'not set', facts: { kind: 'none' } });
  });

  it('asks for a model, and reports one that does not answer', async () => {
    const unset = await runSetupChecks(input({ omniroute: { baseUrl: 'http://omni/v1', apiKey: 'k', model: '' } }));
    expect(step(unset.steps, 'model')).toMatchObject({ status: 'fail', reason: 'modelMissing', detail: 'not chosen', facts: { kind: 'none' } });

    const failing = await runSetupChecks(input({ testModel: async () => ({ ok: false, model: 'cc/model', latencyMs: 9, error: 'HTTP 404: unknown model' }) }));
    expect(step(failing.steps, 'model')).toMatchObject({
      status: 'fail',
      reason: 'modelFailed',
      detail: 'cc/model: HTTP 404: unknown model',
      facts: { kind: 'modelFailed', model: 'cc/model', error: 'HTTP 404: unknown model' },
    });
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
    expect(step(steps, 'kbagent')).toEqual({
      id: 'kbagent',
      status: 'fail',
      reason: 'kbagentMissing',
      detail: 'not installed or not on PATH',
      facts: { kind: 'error', message: 'not installed or not on PATH' },
    });
    expect(step(steps, 'projects')).toMatchObject({ status: 'blocked' });
    expect(step(steps, 'project')).toMatchObject({ status: 'blocked' });
  });

  it('asks to connect a project when kbagent has none, and reports when it cannot list them', async () => {
    const none = await runSetupChecks(input({ keboolaProjects: async () => [] }));
    expect(step(none.steps, 'projects')).toMatchObject({ status: 'fail', reason: 'projectsNone', detail: 'none registered', facts: { kind: 'none' } });
    expect(step(none.steps, 'project')).toMatchObject({ status: 'blocked' });

    const failing = await runSetupChecks(
      input({
        keboolaProjects: async () => {
          throw new Error('kbagent project list failed (exit 5)');
        },
      }),
    );
    expect(step(failing.steps, 'projects')).toMatchObject({
      status: 'fail',
      reason: 'projectsFailed',
      detail: 'kbagent project list failed (exit 5)',
      facts: { kind: 'error', message: 'kbagent project list failed (exit 5)' },
    });
  });

  it('accepts kbagent default or only project when none is configured', async () => {
    const byDefault = await runSetupChecks(input({ keboolaProject: '' }));
    expect(step(byDefault.steps, 'project')).toMatchObject({ status: 'ok', detail: 'sandbox (kbagent default)', facts: { kind: 'project', alias: 'sandbox', source: 'default' } });

    const only = await runSetupChecks(input({ keboolaProject: '', keboolaProjects: async () => [project('solo')] }));
    expect(step(only.steps, 'project')).toMatchObject({ status: 'ok', detail: 'solo (the only one)', facts: { kind: 'project', alias: 'solo', source: 'only' } });
  });

  it('asks to choose among several projects or to replace one kbagent does not know', async () => {
    const several = await runSetupChecks(input({ keboolaProject: '', keboolaProjects: async () => [project('a'), project('b')] }));
    expect(step(several.steps, 'project')).toMatchObject({ status: 'fail', reason: 'projectMissing', detail: 'not chosen', facts: { kind: 'none' } });

    const unknown = await runSetupChecks(input({ keboolaProject: 'gone' }));
    expect(step(unknown.steps, 'project')).toMatchObject({
      status: 'fail',
      reason: 'projectUnknown',
      detail: 'gone is not registered in kbagent',
      facts: { kind: 'projectUnknown', alias: 'gone' },
    });
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
    expect(step(result.steps, 'model')?.facts).toEqual({ kind: 'modelFailed', model: 'm', error: 'bad [redacted]' });
  });

  describe('Keboola access', () => {
    const access = (overrides = {}) => ({ project: 'sandbox', backend: 'snowflake', role: 'admin', session: 'live', mergeRequests: false, protectedProduction: false, changePath: 'promote' as const, sql: true, ...overrides });

    it('adds what the analyst may do in Keboola once the project is set', async () => {
      const result = await runSetupChecks(input({ keboolaAccess: async () => access() }));
      expect(step(result.steps, 'access')).toEqual({
        id: 'access',
        status: 'ok',
        detail: 'admin · snowflake · changes: promotion in the app',
        facts: { kind: 'access', role: 'admin', backend: 'snowflake', changePath: 'promote', protectedProduction: false },
      });
      expect(result.complete).toBe(true);

      const readOnly = await runSetupChecks(input({ keboolaAccess: async () => access({ role: 'readOnly', changePath: 'read-only', sql: false }) }));
      expect(step(readOnly.steps, 'access')).toMatchObject({ status: 'ok', detail: 'readOnly · snowflake · changes: read-only', facts: { kind: 'access', role: 'readOnly', changePath: 'read-only' } });

      // A Storage token has no role; production can be protected.
      const token = await runSetupChecks(
        input({ keboolaAccess: async () => access({ role: undefined, session: undefined, authMode: 'token', changePath: 'keboola-ui', protectedProduction: true }) }),
      );
      expect(step(token.steps, 'access')?.facts).toEqual({ kind: 'access', token: true, backend: 'snowflake', changePath: 'keboola-ui', protectedProduction: true });
    });

    it('fails on an expired kbagent sign-in or an unreadable project', async () => {
      const expired = await runSetupChecks(input({ keboolaAccess: async () => access({ session: 'expired' }) }));
      expect(step(expired.steps, 'access')).toEqual({
        id: 'access',
        status: 'fail',
        reason: 'sessionExpired',
        detail: 'kbagent session expired',
        facts: { kind: 'session', session: 'expired' },
      });
      expect(expired.complete).toBe(false);

      const broken = await runSetupChecks(input({ keboolaAccess: async () => Promise.reject(new Error('kbagent could not read the project')) }));
      expect(step(broken.steps, 'access')).toMatchObject({
        status: 'fail',
        reason: 'accessUnreadable',
        detail: 'kbagent could not read the project',
        facts: { kind: 'error', message: 'kbagent could not read the project' },
      });
    });

    it('waits for a project before reading the access', async () => {
      const keboolaAccess = vi.fn(async () => access());
      const { steps } = await runSetupChecks(input({ keboolaProjects: async () => [], keboolaAccess }));
      expect(step(steps, 'access')).toMatchObject({ status: 'blocked' });
      expect(keboolaAccess).not.toHaveBeenCalled();
    });
  });
});

