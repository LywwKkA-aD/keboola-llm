import { afterEach, describe, expect, it } from 'vitest';
import type { Settings } from '../config/settings.ts';
import { createEventBus } from './bus.ts';
import { allowedFor } from './guard.ts';
import { type RunManager, runError } from './runs.ts';
import { createServer, type ServerDeps } from './server.ts';
import { createThreadStore } from './threads.ts';
import { makeTree } from '../test-utils/tree.ts';
import { join } from 'node:path';

const HOST = { host: '127.0.0.1:4800' };

function fakeRuns(): RunManager & { started: Array<[string, unknown]> } {
  const started: Array<[string, unknown]> = [];
  const busy = new Set<string>();
  return {
    started,
    start(threadId, input) {
      if (busy.has(threadId)) throw runError('RUN_CONFLICT', 'Thread is busy with another run');
      started.push([threadId, input]);
      return { runId: `run-${started.length}`, done: Promise.resolve() };
    },
    answer(threadId, answers) {
      if (answers.length === 0) throw runError('RUN_CONFLICT', 'No pending approvals for this thread');
      started.push([threadId, answers]);
      return { runId: 'run-answer', done: Promise.resolve() };
    },
    pending: () => [],
    isBusy: (threadId) => busy.has(threadId),
    cancel: (threadId) => {
      busy.add(threadId);
      return true;
    },
  };
}

function setup(overrides: Partial<ServerDeps> = {}) {
  let settings: Settings = { language: 'ru' };
  const runs = fakeRuns();
  const deps: ServerDeps = {
    bus: createEventBus({ historyPerThread: 10 }),
    runs,
    threads: createThreadStore(join(makeTree({}), 'threads.json')),
    team: () => ({ lead: 'lead', agents: [], skills: [], warnings: [], loadErrors: [] }),
    settings: {
      get: () => settings,
      set: (patch) => {
        settings = { ...settings, ...patch };
        return settings;
      },
    },
    history: async () => [{ id: 'h', role: 'user', text: 'hi' }],
    deleteThread: async () => {},
    allowed: allowedFor({ port: 4800, devPort: 5173 }),
    ...overrides,
  };
  return { app: createServer(deps), runs, deps };
}

let close: (() => Promise<unknown>) | undefined;
afterEach(async () => {
  await close?.();
});

describe('createServer', () => {
  it('rejects requests from foreign hosts and origins', async () => {
    const { app } = setup();
    close = () => app.close();
    expect((await app.inject({ url: '/api/health', headers: { host: 'evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/health', headers: { ...HOST, origin: 'https://evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/health', headers: HOST })).json()).toEqual({ ok: true });
  });

  it('creates a thread from the first message and starts a run', async () => {
    const { app, runs } = setup();
    close = () => app.close();
    const response = await app.inject({ method: 'POST', url: '/api/threads', headers: HOST, payload: { text: 'Where is customer_id used?' } });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.thread.title).toBe('Where is customer_id used?');
    expect(body.runId).toBe('run-1');
    expect(runs.started[0]?.[1]).toEqual({ messages: [{ role: 'user', content: 'Where is customer_id used?' }] });

    const list = await app.inject({ url: '/api/threads', headers: HOST });
    expect(list.json().map((thread: { id: string }) => thread.id)).toEqual([body.thread.id]);
  });

  it('validates message bodies and unknown threads', async () => {
    const { app } = setup();
    close = () => app.close();
    expect((await app.inject({ method: 'POST', url: '/api/threads', headers: HOST, payload: { text: '' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/threads/nope/messages', headers: HOST, payload: { text: 'x' } })).statusCode).toBe(404);
  });

  it('answers 409 when the thread is busy', async () => {
    const { app } = setup();
    close = () => app.close();
    const created = (await app.inject({ method: 'POST', url: '/api/threads', headers: HOST, payload: { text: 'a' } })).json();
    await app.inject({ method: 'POST', url: `/api/threads/${created.thread.id}/cancel`, headers: HOST });
    const response = await app.inject({ method: 'POST', url: `/api/threads/${created.thread.id}/messages`, headers: HOST, payload: { text: 'b' } });
    expect(response.statusCode).toBe(409);
  });

  it('returns history, renames and deletes threads', async () => {
    const { app } = setup();
    close = () => app.close();
    const { thread } = (await app.inject({ method: 'POST', url: '/api/threads', headers: HOST, payload: { text: 'a' } })).json();

    expect((await app.inject({ url: `/api/threads/${thread.id}/messages`, headers: HOST })).json()).toEqual([{ id: 'h', role: 'user', text: 'hi' }]);
    await app.inject({ method: 'PATCH', url: `/api/threads/${thread.id}`, headers: HOST, payload: { title: 'Renamed' } });
    expect((await app.inject({ url: '/api/threads', headers: HOST })).json()[0].title).toBe('Renamed');
    expect((await app.inject({ method: 'DELETE', url: `/api/threads/${thread.id}`, headers: HOST })).statusCode).toBe(204);
    expect((await app.inject({ url: '/api/threads', headers: HOST })).json()).toEqual([]);
  });

  it('forwards approval answers and validates them', async () => {
    const { app, runs } = setup();
    close = () => app.close();
    const { thread } = (await app.inject({ method: 'POST', url: '/api/threads', headers: HOST, payload: { text: 'a' } })).json();
    const url = `/api/threads/${thread.id}/approvals`;

    const ok = await app.inject({ method: 'POST', url, headers: HOST, payload: { answers: [{ interruptId: 'i', decisions: [{ type: 'approve' }] }] } });
    expect(ok.statusCode).toBe(202);
    expect(runs.started.at(-1)?.[1]).toEqual([{ interruptId: 'i', decisions: [{ type: 'approve' }] }]);

    const bad = await app.inject({ method: 'POST', url, headers: HOST, payload: { answers: [{ interruptId: 'i', decisions: [{ type: 'maybe' }] }] } });
    expect(bad.statusCode).toBe(400);
    const none = await app.inject({ method: 'POST', url, headers: HOST, payload: { answers: [] } });
    expect(none.statusCode).toBe(409);
  });

  it('reads and updates settings', async () => {
    const { app } = setup();
    close = () => app.close();
    expect((await app.inject({ url: '/api/settings', headers: HOST })).json()).toEqual({ language: 'ru' });
    const updated = await app.inject({ method: 'PUT', url: '/api/settings', headers: HOST, payload: { language: 'cs' } });
    expect(updated.json()).toEqual({ language: 'cs' });
    expect((await app.inject({ method: 'PUT', url: '/api/settings', headers: HOST, payload: { language: 'de' } })).statusCode).toBe(400);
  });

  it('describes the team', async () => {
    const { app } = setup();
    close = () => app.close();
    expect((await app.inject({ url: '/api/team', headers: HOST })).json()).toMatchObject({ lead: 'lead' });
  });
});
