import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OmniRouteConfig } from '../../config/env.ts';
import { createSetupService, type SetupService } from '../../setup/service.ts';
import { makeTree } from '../../test-utils/tree.ts';
import { allowedFor } from '../guard.ts';
import { createServer, type ServerDeps } from '../server.ts';

const HOST = { host: '127.0.0.1:4800' };
const KEY = 'sk-setup-route-secret-42';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

/** Only the Host/Origin guard and the setup routes run here; the other routes never get a request. */
const serverWith = (setup: SetupService) =>
  createServer({ allowed: allowedFor({ port: 4800, devPort: 5173 }), setup } as unknown as ServerDeps);

/** The real service over a temp .env and an OmniRoute stand-in that accepts KEY only. */
function realService() {
  const root = makeTree({ '.env': '# keep me\nOMNIROUTE_MODEL=cc/model\n' });
  let omniroute: OmniRouteConfig = { baseUrl: 'http://omni/v1', apiKey: '', model: 'cc/model' };
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (auth !== `Bearer ${KEY}`) return json({ error: { message: `Invalid key ${auth ?? ''}` } }, 401);
    return String(url).endsWith('/models') ? json({ data: [{ id: 'cc/model' }] }) : json({ error: { message: `upstream echoed ${KEY}` } }, 502);
  });
  const service = createSetupService({
    envFile: join(root, '.env'),
    current: () => ({ omniroute, model: 'cc/model', keboolaProject: 'sandbox' }),
    kbagentVersion: async () => 'kbagent v0.100.2',
    keboolaProjects: async () => [{ alias: 'sandbox', name: 'Sandbox', id: 1, stackUrl: 'https://x', isDefault: true }],
    apply: (next) => {
      omniroute = next;
    },
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { root, service };
}

function fakeService(overrides: Partial<SetupService> = {}): SetupService {
  return {
    report: vi.fn(async () => ({
      steps: [],
      complete: true,
      models: [],
      projects: [],
      omniroute: { baseUrl: 'http://omni/v1', apiKeySet: true },
      effective: { model: 'cc/model', keboolaProject: '' },
    })),
    testModel: vi.fn(async () => ({ ok: true, model: 'cc/model', latencyMs: 12 })),
    saveOmniRoute: vi.fn(() => ({ baseUrl: 'http://omni/v1', apiKeySet: true })),
    ...overrides,
  };
}

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('setup routes', () => {
  it('sit behind the Host/Origin guard', async () => {
    const setup = fakeService();
    app = await serverWith(setup);
    expect((await app.inject({ url: '/api/setup', headers: { host: 'evil.example' } })).statusCode).toBe(403);
    const foreign = await app.inject({ method: 'POST', url: '/api/setup/omniroute', headers: { ...HOST, origin: 'https://evil.example' }, payload: { apiKey: KEY } });
    expect(foreign.statusCode).toBe(403);
    expect(setup.saveOmniRoute).not.toHaveBeenCalled();
  });

  it('reports the checklist and passes a retest on', async () => {
    const setup = fakeService();
    app = await serverWith(setup);
    expect((await app.inject({ url: '/api/setup', headers: HOST })).json()).toMatchObject({ complete: true });
    await app.inject({ url: '/api/setup?retest=1', headers: HOST });
    expect(vi.mocked(setup.report).mock.calls).toEqual([[{ retest: false }], [{ retest: true }]]);
  });

  it('tests the model on demand', async () => {
    app = await serverWith(fakeService());
    const response = await app.inject({ method: 'POST', url: '/api/setup/test-model', headers: HOST });
    expect(response.json()).toEqual({ ok: true, model: 'cc/model', latencyMs: 12 });
  });

  it('validates the key form and answers only whether a key is set', async () => {
    const setup = fakeService();
    app = await serverWith(setup);
    const save = (payload: unknown) => app!.inject({ method: 'POST', url: '/api/setup/omniroute', headers: HOST, payload: payload as object });

    const saved = await save({ apiKey: ` ${KEY} `, baseUrl: 'http://127.0.0.1:20128/v1' });
    expect(saved.json()).toEqual({ baseUrl: 'http://omni/v1', apiKeySet: true });
    expect(setup.saveOmniRoute).toHaveBeenCalledWith({ apiKey: KEY, baseUrl: 'http://127.0.0.1:20128/v1' });

    const invalid = [
      {},
      { apiKey: '' },
      { apiKey: `${KEY} with spaces` },
      { apiKey: `${KEY}"quoted` },
      { apiKey: 'x'.repeat(600) },
      { apiKey: KEY, baseUrl: 'ftp://host/v1' },
      { apiKey: KEY, baseUrl: 'http://user:pass@host/v1' },
      // The URL parser drops line breaks, .env would not: a second assignment must not get in.
      { apiKey: KEY, baseUrl: 'http://host/v1\nOMNIROUTE_MODEL=evil' },
      { apiKey: KEY, baseUrl: 'http://host/v1 x' },
      { apiKey: KEY, extra: true },
    ];
    for (const payload of invalid) {
      const response = await save(payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Invalid request' });
    }
    expect(setup.saveOmniRoute).toHaveBeenCalledTimes(1);
  });

  it('does not echo the key from a body it cannot parse', async () => {
    app = await serverWith(fakeService());
    const response = await app.inject({
      method: 'POST',
      url: '/api/setup/omniroute',
      headers: { ...HOST, 'content-type': 'application/json' },
      payload: `{"apiKey": "${KEY}`,
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(KEY);
  });

  it('answers a generic error when .env cannot be written', async () => {
    const setup = fakeService({
      saveOmniRoute: () => {
        throw Object.assign(new Error(`EACCES: permission denied, open '.env' (${KEY})`), { code: 'EACCES' });
      },
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    app = await serverWith(setup);
    const response = await app.inject({ method: 'POST', url: '/api/setup/omniroute', headers: HOST, payload: { apiKey: KEY } });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Internal error' });
    expect(JSON.stringify(errors.mock.calls)).not.toContain(KEY);
    errors.mockRestore();
  });

  it('never returns the key from any setup endpoint, end to end', async () => {
    const { root, service } = realService();
    app = await serverWith(service);
    const bodies: string[] = [];
    const call = async (method: 'GET' | 'POST', url: string, payload?: object) => {
      const response = await app!.inject({ method, url, headers: HOST, ...(payload ? { payload } : {}) });
      bodies.push(response.body);
      return response;
    };

    expect((await call('GET', '/api/setup')).json().steps[1]).toMatchObject({ status: 'fail', reason: 'keyMissing' });
    expect((await call('POST', '/api/setup/omniroute', { apiKey: KEY })).json()).toEqual({ baseUrl: 'http://omni/v1', apiKeySet: true });
    const after = (await call('GET', '/api/setup?retest=1')).json();
    expect(after.steps[1]).toMatchObject({ status: 'ok' });
    expect(after.steps[2]).toMatchObject({ status: 'fail', reason: 'modelFailed' });
    expect((await call('POST', '/api/setup/test-model')).json()).toMatchObject({ ok: false, error: 'HTTP 502: upstream echoed [redacted]' });

    bodies.forEach((body) => expect(body).not.toContain(KEY));
    const env = readFileSync(join(root, '.env'), 'utf8');
    expect(env.startsWith('# keep me\n')).toBe(true);
    expect(parseEnv(env)).toEqual({ OMNIROUTE_MODEL: 'cc/model', OMNIROUTE_API_KEY: KEY });
  });
});
