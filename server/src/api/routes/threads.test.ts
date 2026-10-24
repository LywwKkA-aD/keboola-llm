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
