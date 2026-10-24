import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../config/settings.ts';
import { createEventBus } from './bus.ts';
import { allowedFor } from './guard.ts';
import { type RunManager, runError } from './runs.ts';
import { createServer, type ServerDeps } from './server.ts';
import { createThreadStore } from './threads.ts';
import { makeTree } from '../test-utils/tree.ts';
import { createNoteStore } from '../knowledge/store.ts';
import { join } from 'node:path';

const HOST = { host: '127.0.0.1:4800' };

function fakeRuns(): RunManager & { started: Array<[string, unknown]>; discarded: string[]; busy: Set<string> } {
  const started: Array<[string, unknown]> = [];
  const discarded: string[] = [];
  const busy = new Set<string>();
  return {
    started,
    discarded,
    busy,
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
    resume: () => ({ runId: 'run-resume', done: Promise.resolve() }),
    pending: () => [],
    active: () => [],
    waitingThreads: () => [],
    resumable: () => [],
    discard: (threadId) => {
      discarded.push(threadId);
    },
    isBusy: (threadId) => busy.has(threadId),
    cancel: (threadId) => {
      busy.add(threadId);
      return true;
    },
  };
}

async function setup(overrides: Partial<ServerDeps> = {}) {
  let settings: Settings = { ...DEFAULT_SETTINGS };
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
    models: async () => ['a/model', 'b/model'],
    keboolaProjects: async () => [{ alias: 'sandbox', name: 'Sandbox', id: 1, stackUrl: 'https://x', isDefault: true }],
    knowledge: createNoteStore(makeTree({ 'README.md': '# Knowledge base' })),
    memories: createNoteStore(makeTree({ 'AGENTS.md': '# Shared memory' })),
    system: async () => ({
      app: { ok: true, detail: '0.1.0' },
      node: { ok: true, detail: 'v24' },
      omniroute: { ok: true, detail: '2 models' },
      model: { ok: true, detail: 'a/model' },
      kbagent: { ok: false, detail: 'not installed' },
    }),
    effective: () => ({ model: 'a/model', keboolaProject: 'sandbox' }),
    onboarding: async () => ({ project: 'sandbox', profiled: false }),
    version: '0.1.0',
    ...overrides,
  };
  return { app: await createServer(deps), runs, deps };
}

let close: (() => Promise<unknown>) | undefined;
afterEach(async () => {
  await close?.();
});

describe('createServer', () => {
  it('rejects requests from foreign hosts and origins', async () => {
    const { app } = await setup();
    close = () => app.close();
    expect((await app.inject({ url: '/api/health', headers: { host: 'evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/health', headers: { ...HOST, origin: 'https://evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/health', headers: HOST })).json()).toEqual({ ok: true });
  });

  it('creates a thread from the first message and starts a run', async () => {
    const { app, runs } = await setup();
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
    const { app } = await setup();
    close = () => app.close();
    expect((await app.inject({ method: 'POST', url: '/api/threads', headers: HOST, payload: { text: '' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/threads/nope/messages', headers: HOST, payload: { text: 'x' } })).statusCode).toBe(404);
  });

  it('answers 409 when the thread is busy', async () => {
    const { app } = await setup();
    close = () => app.close();
    const created = (await app.inject({ method: 'POST', url: '/api/threads', headers: HOST, payload: { text: 'a' } })).json();
    await app.inject({ method: 'POST', url: `/api/threads/${created.thread.id}/cancel`, headers: HOST });
    const response = await app.inject({ method: 'POST', url: `/api/threads/${created.thread.id}/messages`, headers: HOST, payload: { text: 'b' } });
    expect(response.statusCode).toBe(409);
  });

  it('returns history, renames and deletes threads', async () => {
    const { app, runs } = await setup();
    close = () => app.close();
    const { thread } = (await app.inject({ method: 'POST', url: '/api/threads', headers: HOST, payload: { text: 'a' } })).json();

    expect((await app.inject({ url: `/api/threads/${thread.id}/messages`, headers: HOST })).json()).toEqual([{ id: 'h', role: 'user', text: 'hi' }]);
    await app.inject({ method: 'PATCH', url: `/api/threads/${thread.id}`, headers: HOST, payload: { title: 'Renamed' } });
    expect((await app.inject({ url: '/api/threads', headers: HOST })).json()[0].title).toBe('Renamed');
    expect((await app.inject({ method: 'DELETE', url: `/api/threads/${thread.id}`, headers: HOST })).statusCode).toBe(204);
    expect((await app.inject({ url: '/api/threads', headers: HOST })).json()).toEqual([]);
    // Approvals the deleted chat was waiting for must not outlive it (they are kept on disk).
    expect(runs.discarded).toEqual([thread.id]);
  });

  it('forwards approval answers and validates them', async () => {
    const { app, runs } = await setup();
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
    const { app } = await setup();
    close = () => app.close();
    expect((await app.inject({ url: '/api/settings', headers: HOST })).json()).toEqual(DEFAULT_SETTINGS);
    const updated = await app.inject({ method: 'PUT', url: '/api/settings', headers: HOST, payload: { language: 'cs' } });
    expect(updated.json()).toEqual({ ...DEFAULT_SETTINGS, language: 'cs' });
    const themed = await app.inject({ method: 'PUT', url: '/api/settings', headers: HOST, payload: { theme: 'light', allowSqlByDefault: true } });
    expect(themed.json()).toMatchObject({ language: 'cs', theme: 'light', allowSqlByDefault: true });
    expect((await app.inject({ method: 'PUT', url: '/api/settings', headers: HOST, payload: { apiKey: 'x' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/settings', headers: HOST, payload: { language: 'de' } })).statusCode).toBe(400);
  });

  it('describes the team', async () => {
    const { app } = await setup();
    close = () => app.close();
    expect((await app.inject({ url: '/api/team', headers: HOST })).json()).toMatchObject({ lead: 'lead' });
  });

  it('lets new chats inherit the default SQL permission', async () => {
    const { app, deps } = await setup();
    close = () => app.close();
    deps.settings.set({ allowSqlByDefault: true });
    const { thread } = (await app.inject({ method: 'POST', url: '/api/threads', headers: HOST, payload: { text: 'a' } })).json();
    expect(deps.threads.policy(thread.id)).toEqual({ allowSql: true });
  });

  it('tells whether the team has profiled the Keboola project yet', async () => {
    const { app } = await setup();
    close = () => app.close();
    expect((await app.inject({ url: '/api/onboarding', headers: HOST })).json()).toEqual({ project: 'sandbox', profiled: false, running: false });
  });

  it('starts one project survey chat at a time', async () => {
    const { app, runs } = await setup();
    close = () => app.close();
    const start = () => app.inject({ method: 'POST', url: '/api/onboarding/start', headers: HOST, payload: { text: 'Get to know the project' } });

    const first = await start();
    expect(first.statusCode).toBe(201);
    const { threadId } = first.json();
    expect(runs.started).toEqual([[threadId, { messages: [{ role: 'user', content: 'Get to know the project' }] }]]);
    expect((await app.inject({ url: '/api/threads', headers: HOST })).json()[0]).toMatchObject({ id: threadId, title: 'Get to know the project' });

    // A double click or a reload while the survey runs must not start a second one.
    runs.busy.add(threadId);
    expect((await app.inject({ url: '/api/onboarding', headers: HOST })).json()).toMatchObject({ threadId, running: true });
    const again = await start();
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ threadId });
    expect(runs.started).toHaveLength(1);

    // Once it is over, the user may run it again (e.g. the scout failed to write the profile).
    runs.busy.delete(threadId);
    expect((await start()).statusCode).toBe(201);
    expect(runs.started).toHaveLength(2);
  });

  it('refuses a survey when no Keboola project is set up', async () => {
    const { app } = await setup({ onboarding: async () => ({ project: '', profiled: false }) });
    close = () => app.close();
    const response = await app.inject({ method: 'POST', url: '/api/onboarding/start', headers: HOST, payload: { text: 'x' } });
    expect(response.statusCode).toBe(409);
  });

  it('lists pending approvals across chats with the chat title', async () => {
    const threads = createThreadStore(join(makeTree({}), 'threads.json'));
    const waiting = threads.create('Fix the orders join');
    threads.create('Idle chat');
    const approval = { type: 'approval.required' as const, interruptId: 'i1', requests: [{ tool: 'kbagent_write', agent: 'keboola-expert', args: {}, decisions: ['approve'] }] };
    const runs = { ...fakeRuns(), pending: (id: string) => (id === waiting.id ? [approval] : []) };
    const { app } = await setup({ threads, runs });
    close = () => app.close();

    expect((await app.inject({ url: '/api/approvals', headers: HOST })).json()).toEqual([
      { threadId: waiting.id, threadTitle: 'Fix the orders join', interruptId: 'i1', requests: approval.requests },
    ]);
    expect((await app.inject({ url: '/api/status', headers: HOST })).json()).toEqual({
      model: 'a/model',
      keboolaProject: 'sandbox',
      version: '0.1.0',
      activeRuns: 0,
      pendingApprovals: 1,
    });
  });

  it('exposes models, Keboola projects, shared memory and system checks', async () => {
    const { app } = await setup();
    close = () => app.close();
    expect((await app.inject({ url: '/api/models', headers: HOST })).json()).toEqual({ models: ['a/model', 'b/model'], current: 'a/model' });
    expect((await app.inject({ url: '/api/keboola/projects', headers: HOST })).json()).toMatchObject({ current: 'sandbox', projects: [{ alias: 'sandbox' }] });
    expect((await app.inject({ url: '/api/memory', headers: HOST })).json()).toMatchObject({ content: '# Shared memory' });
    expect((await app.inject({ url: '/api/knowledge', headers: HOST })).json()).toMatchObject({ notes: [{ path: 'README.md', title: 'Knowledge base' }] });
    expect((await app.inject({ url: '/api/system', headers: HOST })).json()).toMatchObject({ kbagent: { ok: false } });
  });

  it('answers 502 when OmniRoute or kbagent cannot be reached', async () => {
    const fail = async () => {
      throw new Error('OmniRoute answered HTTP 401');
    };
    const { app } = await setup({ models: fail, keboolaProjects: fail });
    close = () => app.close();
    const models = await app.inject({ url: '/api/models', headers: HOST });
    expect(models.statusCode).toBe(502);
    expect(models.json()).toEqual({ error: 'OmniRoute answered HTTP 401' });
    expect((await app.inject({ url: '/api/keboola/projects', headers: HOST })).statusCode).toBe(502);
  });
});
