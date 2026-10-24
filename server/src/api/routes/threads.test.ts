import { afterEach, describe, expect, it } from 'vitest';
import { runsWith, TEST_HOST, testDeps } from '../../test-utils/server-deps.ts';
import { runError } from '../runs.ts';
import { createServer } from '../server.ts';

/** A server whose run manager continues exactly the chats added to `unfinished`. */
async function setup() {
  const unfinished = new Set<string>();
  const resumed: string[] = [];
  const deps = testDeps({
    runs: runsWith({
      resumable: () => [...unfinished],
      resume: (threadId) => {
        if (!unfinished.has(threadId)) throw runError('RUN_CONFLICT', 'Nothing to continue in this chat');
        resumed.push(threadId);
        return { runId: 'run-resumed', done: Promise.resolve() };
      },
    }),
  });
  const app = await createServer(deps);
  close = () => app.close();
  return { app, threads: deps.threads, unfinished, resumed };
}

let close: (() => Promise<unknown>) | undefined;
afterEach(async () => {
  await close?.();
});

describe('resume route', () => {
  it('continues the unfinished run of a chat', async () => {
    const { app, threads, unfinished, resumed } = await setup();
    const thread = threads.create('Count orders');
    unfinished.add(thread.id);

    const response = await app.inject({ method: 'POST', url: `/api/threads/${thread.id}/resume`, headers: TEST_HOST });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ runId: 'run-resumed' });
    expect(resumed).toEqual([thread.id]);
  });

  it('answers 409 when there is nothing to continue and 404 for unknown chats', async () => {
    const { app, threads } = await setup();
    const thread = threads.create('Count orders');
    const conflict = await app.inject({ method: 'POST', url: `/api/threads/${thread.id}/resume`, headers: TEST_HOST });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: 'Nothing to continue in this chat' });
    expect((await app.inject({ method: 'POST', url: '/api/threads/nope/resume', headers: TEST_HOST })).statusCode).toBe(404);
  });

  it('is behind the Host/Origin guard', async () => {
    const { app, threads, unfinished, resumed } = await setup();
    const thread = threads.create('Count orders');
    unfinished.add(thread.id);
    const url = `/api/threads/${thread.id}/resume`;
    expect((await app.inject({ method: 'POST', url, headers: { host: 'evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url, headers: { ...TEST_HOST, origin: 'https://evil.example' } })).statusCode).toBe(403);
    expect(resumed).toEqual([]);
  });
});

describe('messages with a command', () => {
  const team = () => ({
    lead: 'lead',
    agents: [
      { name: 'lead', description: '', role: 'orchestrator' as const, enabled: true, skills: [], tools: [] },
      { name: 'keboola-developer', description: '', role: 'subagent' as const, enabled: true, skills: [], tools: [] },
    ],
    skills: [{ name: 'keboola-change', description: '', source: 'custom', path: '/skills/custom/keboola-change/' }],
    warnings: [],
    loadErrors: [],
  });

  async function commandSetup() {
    const started: { threadId: string; input: unknown }[] = [];
    const deps = testDeps({
      team,
      runs: runsWith({
        start: (threadId, input) => {
          started.push({ threadId, input });
          return { runId: 'run', done: Promise.resolve() };
        },
      }),
    });
    const app = await createServer(deps);
    close = () => app.close();
    return { app, threads: deps.threads, started };
  }

  const post = (app: Awaited<ReturnType<typeof commandSetup>>['app'], url: string, payload: object) =>
    app.inject({ method: 'POST', url, headers: TEST_HOST, payload });

  it('starts a chat with the command turned into an instruction, titled with what the user typed', async () => {
    const { app, started } = await commandSetup();
    const response = await post(app, '/api/threads', { text: 'Fix the join', command: { name: 'agent', arg: 'keboola-developer' } });
    expect(response.statusCode).toBe(201);
    expect((response.json() as { thread: { title: string } }).thread.title).toBe('Fix the join');
    const message = (started[0]?.input as { messages: { content: string; additional_kwargs: unknown }[] }).messages[0];
    expect(message?.content).toContain('"keboola-developer"');
    expect(message?.additional_kwargs).toEqual({ studio: { text: 'Fix the join', command: { name: 'agent', arg: 'keboola-developer' } } });
  });

  it('titles a chat started by a command alone with the command', async () => {
    const { app } = await commandSetup();
    const response = await post(app, '/api/threads', { text: '', command: { name: 'skill', arg: 'keboola-change' } });
    expect((response.json() as { thread: { title: string } }).thread.title).toBe('/skill keboola-change');
  });

  it('sends a command in an existing chat and refuses one the team cannot follow', async () => {
    const { app, threads, started } = await commandSetup();
    const thread = threads.create('Orders');
    const sent = await post(app, `/api/threads/${thread.id}/messages`, { text: 'Rebuild it', command: { name: 'plan' } });
    expect(sent.statusCode).toBe(202);
    expect(JSON.stringify(started.at(-1)?.input)).toContain('request_plan_approval');

    const unknown = await post(app, `/api/threads/${thread.id}/messages`, { text: 'Go', command: { name: 'skill', arg: 'ghost' } });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toEqual({ error: 'No skill "ghost" in this team' });
    expect((await post(app, '/api/threads', { text: '  ' })).statusCode).toBe(400);
    expect((await post(app, '/api/threads', { text: 'x', command: { name: 'rm' } })).statusCode).toBe(400);
    expect(started).toHaveLength(1);
  });
});

describe('thread list', () => {
  it('marks the chats whose run stopped before it finished', async () => {
    const { app, threads, unfinished } = await setup();
    const cut = threads.create('Cut off');
    const done = threads.create('Done');
    unfinished.add(cut.id);

    const list = (await app.inject({ url: '/api/threads', headers: TEST_HOST })).json() as { id: string; resumable?: boolean }[];
    expect(list.find((thread) => thread.id === cut.id)?.resumable).toBe(true);
    expect(list.find((thread) => thread.id === done.id)).not.toHaveProperty('resumable');
  });
});
