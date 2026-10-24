import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoutines } from '../../routines/service.ts';
import { fakeClock } from '../../test-utils/clock.ts';
import { makeTree } from '../../test-utils/tree.ts';
import { createEventBus } from '../bus.ts';
import { allowedFor } from '../guard.ts';
import { createServer, type ServerDeps } from '../server.ts';
import { createThreadStore } from '../threads.ts';

const HOST = { host: '127.0.0.1:4800' };
const MORNING = '---\nname: morning-check\ntitle: Morning check\ndescription: Weekday health check.\nschedule: "0 8 * * 1-5"\n---\n\nCheck the jobs.\n';

async function setup() {
  const root = makeTree({ 'routines/morning-check.md': MORNING, 'routines/broken.md': '---\nname: broken\n---\n' });
  const threads = createThreadStore(join(root, 'data', 'threads.json'));
  const busy = new Set<string>();
  const runs = {
    start: (threadId: string) => {
      busy.add(threadId);
      return { runId: 'r1', done: Promise.resolve() };
    },
    isBusy: (threadId: string) => busy.has(threadId),
  };
  const routines = createRoutines({
    rootDir: root,
    dataDir: join(root, 'data'),
    threads,
    runs,
    clock: fakeClock('2026-10-26T07:30:00Z').clock,
    timeZone: () => 'UTC',
    logger: { log: () => {}, warn: () => {} },
  });
  // Only the routines routes are exercised; the rest of the deps stay unused.
  const deps = { bus: createEventBus({ historyPerThread: 10 }), threads, allowed: allowedFor({ port: 4800, devPort: 5173 }), routines: routines.api };
  const app = await createServer(deps as unknown as ServerDeps);
  return { app, busy, threads };
}

let close: (() => Promise<unknown>) | undefined;
afterEach(async () => {
  await close?.();
});

describe('routines API', () => {
  it('lists routines and the files it could not load', async () => {
    const { app } = await setup();
    close = () => app.close();
    const response = await app.inject({ url: '/api/routines', headers: HOST });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      routines: [
        { name: 'morning-check', title: 'Morning check', description: 'Weekday health check.', schedule: '0 8 * * 1-5', timezone: 'UTC', enabled: false },
      ],
      loadErrors: [{ file: 'routines/broken.md', message: expect.any(String) }],
    });
  });

  it('switches a routine on and off', async () => {
    const { app } = await setup();
    close = () => app.close();
    const on = await app.inject({ method: 'PUT', url: '/api/routines/morning-check', headers: HOST, payload: { enabled: true } });

    expect(on.statusCode).toBe(200);
    expect(on.json()).toMatchObject({ name: 'morning-check', enabled: true, nextRun: '2026-10-26T08:00:00.000Z' });
    expect((await app.inject({ url: '/api/routines', headers: HOST })).json().routines[0].enabled).toBe(true);
  });

  it('validates the switch body and unknown routines', async () => {
    const { app } = await setup();
    close = () => app.close();
    const put = (url: string, payload: unknown) => app.inject({ method: 'PUT', url, headers: HOST, payload: payload as object });

    expect((await put('/api/routines/morning-check', { enabled: 'yes' })).statusCode).toBe(400);
    expect((await put('/api/routines/morning-check', { enabled: true, schedule: '* * * * *' })).statusCode).toBe(400);
    expect((await put('/api/routines/nope', { enabled: true })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/routines/nope/run', headers: HOST })).statusCode).toBe(404);
  });

  it('runs a routine now, and answers 409 while that run still goes', async () => {
    const { app, busy, threads } = await setup();
    close = () => app.close();
    const run = () => app.inject({ method: 'POST', url: '/api/routines/morning-check/run', headers: HOST });

    const first = await run();
    expect(first.statusCode).toBe(201);
    const { threadId } = first.json();
    expect(threads.get(threadId)?.title).toBe('Morning check · 2026-10-26');
    expect((await app.inject({ url: '/api/routines', headers: HOST })).json().routines[0].lastRun).toEqual({
      at: '2026-10-26T07:30:00.000Z',
      threadId,
      running: true,
    });

    expect((await run()).statusCode).toBe(409);
    busy.clear();
    expect((await run()).statusCode).toBe(201);
  });

  it('sits behind the Host/Origin guard', async () => {
    const { app } = await setup();
    close = () => app.close();
    const response = await app.inject({ method: 'POST', url: '/api/routines/morning-check/run', headers: { ...HOST, origin: 'https://evil.example' } });
    expect(response.statusCode).toBe(403);
  });
});
