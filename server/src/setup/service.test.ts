import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import type { OmniRouteConfig } from '../config/env.ts';
import { makeTree } from '../test-utils/tree.ts';
import { createSetupService } from './service.ts';

const OLD_KEY = 'sk-old-0000000000';
const NEW_KEY = 'sk-new-1111111111';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

/** An OmniRoute stand-in that accepts only `accepted` and answers completions with `reply`. */
function fakeOmniRoute(accepted: string, reply: () => Response = () => json({ choices: [{ message: { content: 'OK' } }] })) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (auth !== `Bearer ${accepted}`) return json({ error: { message: 'unauthorized' } }, 401);
    return String(url).endsWith('/models') ? json({ data: [{ id: 'cc/model' }] }) : reply();
  });
}

function setup(options: { fetchImpl?: ReturnType<typeof fakeOmniRoute>; files?: Record<string, string> } = {}) {
  const root = makeTree(options.files ?? { '.env.example': '# OmniRoute\nOMNIROUTE_API_KEY=\nOMNIROUTE_MODEL=\n' });
  let omniroute: OmniRouteConfig = { baseUrl: 'http://omni/v1', apiKey: OLD_KEY, model: '' };
  const fetchImpl = options.fetchImpl ?? fakeOmniRoute(OLD_KEY);
  const apply = vi.fn((next: OmniRouteConfig) => {
    omniroute = next;
  });
  const service = createSetupService({
    envFile: join(root, '.env'),
    envTemplate: join(root, '.env.example'),
    current: () => ({ omniroute, model: 'cc/model', keboolaProject: '' }),
    kbagentVersion: async () => 'kbagent v0.100.2',
    keboolaProjects: async () => [{ alias: 'sandbox', name: 'Sandbox', id: 1, stackUrl: 'https://x', isDefault: true }],
    apply,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const completions = () => fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions')).length;
  return { root, service, apply, fetchImpl, completions };
}

describe('createSetupService', () => {
  it('reports the checklist, the OmniRoute address and whether a key is set, never the key', async () => {
    const { service } = setup();
    const report = await service.report();

    expect(report.complete).toBe(true);
    expect(report.omniroute).toEqual({ baseUrl: 'http://omni/v1', apiKeySet: true });
    expect(report.effective).toEqual({ model: 'cc/model', keboolaProject: '' });
    expect(report.steps.map((step) => step.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
    expect(report.models).toEqual(['cc/model']);
    expect(JSON.stringify(report)).not.toContain(OLD_KEY);
  });

  it('tests the model once per key and model, and shares a test that is still running', async () => {
    const { service, completions } = setup();
    await Promise.all([service.report(), service.report()]);
    await service.report();
    expect(completions()).toBe(1);
  });

  it('tests a failed model again on retest, a working one only when asked to', async () => {
    let status = 500;
    const fetchImpl = fakeOmniRoute(OLD_KEY, () => (status === 200 ? json({ choices: [{}] }) : json({ error: { message: 'provider down' } }, status)));
    const { service, completions } = setup({ fetchImpl });

    expect((await service.report()).steps[2]).toMatchObject({ status: 'fail', detail: 'cc/model: HTTP 500: provider down' });
    status = 200;
    expect((await service.report()).steps[2]).toMatchObject({ status: 'fail' });
    expect((await service.report({ retest: true })).steps[2]).toMatchObject({ status: 'ok' });
    await service.report({ retest: true });
    expect(completions()).toBe(2);

    expect(await service.testModel()).toMatchObject({ ok: true, model: 'cc/model' });
    expect(completions()).toBe(3);
  });

  it('saves the key to .env, applies it at once and answers only that a key is set', async () => {
    const fetchImpl = fakeOmniRoute(NEW_KEY);
    const { root, service, apply } = setup({ fetchImpl });
    expect((await service.report()).steps[1]).toMatchObject({ status: 'fail', reason: 'keyRejected' });

    const state = service.saveOmniRoute({ apiKey: NEW_KEY });
    expect(state).toEqual({ baseUrl: 'http://omni/v1', apiKeySet: true });
    expect(JSON.stringify(state)).not.toContain(NEW_KEY);
    expect(apply).toHaveBeenCalledWith({ baseUrl: 'http://omni/v1', apiKey: NEW_KEY, model: '' });

    const written = readFileSync(join(root, '.env'), 'utf8');
    expect(written.startsWith('# OmniRoute\n')).toBe(true);
    expect(parseEnv(written)).toEqual({ OMNIROUTE_API_KEY: NEW_KEY, OMNIROUTE_MODEL: '' });
    expect((await service.report()).steps[1]).toMatchObject({ status: 'ok' });
  });

  it('saves a new address with the key, without trailing slashes', async () => {
    const { root, service, apply } = setup({ files: { '.env': 'OMNIROUTE_BASE_URL=http://old/v1\n' } });
    expect(service.saveOmniRoute({ apiKey: NEW_KEY, baseUrl: 'http://127.0.0.1:20129/v1/' })).toEqual({ baseUrl: 'http://127.0.0.1:20129/v1', apiKeySet: true });
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'http://127.0.0.1:20129/v1' }));
    expect(parseEnv(readFileSync(join(root, '.env'), 'utf8'))).toEqual({ OMNIROUTE_BASE_URL: 'http://127.0.0.1:20129/v1', OMNIROUTE_API_KEY: NEW_KEY });
  });

  it('keeps the running config when .env cannot be written', () => {
    const { root, service, apply } = setup();
    const blocked = createSetupService({
      envFile: join(root, 'missing-dir', '.env'),
      current: () => ({ omniroute: { baseUrl: 'http://omni/v1', apiKey: '', model: '' }, model: '', keboolaProject: '' }),
      kbagentVersion: async () => '',
      keboolaProjects: async () => [],
      apply,
    });
    expect(() => blocked.saveOmniRoute({ apiKey: NEW_KEY })).toThrow();
    expect(apply).not.toHaveBeenCalled();
    expect(service).toBeDefined();
  });
});
