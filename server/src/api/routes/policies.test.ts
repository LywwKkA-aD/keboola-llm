import { join } from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTree } from '../../test-utils/tree.ts';
import { createThreadStore } from '../threads.ts';
import { registerPolicyRoutes } from './policies.ts';

function setup() {
  const threads = createThreadStore(join(makeTree({}), 'threads.json'));
  const app = Fastify();
  registerPolicyRoutes(app, { threads });
  return { app, threads };
}

let close: (() => Promise<unknown>) | undefined;
afterEach(async () => {
  await close?.();
});

describe('policy routes', () => {
  it('reads and updates the per-chat SQL permission', async () => {
    const { app, threads } = setup();
    close = () => app.close();
    const thread = threads.create('Count orders');
    const url = `/api/threads/${thread.id}/policy`;

    expect((await app.inject({ url })).json()).toEqual({ allowSql: false });
    const updated = await app.inject({ method: 'PUT', url, payload: { allowSql: true } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({ allowSql: true });
    expect(threads.policy(thread.id)).toEqual({ allowSql: true });
  });

  it('rejects invalid bodies', async () => {
    const { app, threads } = setup();
    close = () => app.close();
    const url = `/api/threads/${threads.create('x').id}/policy`;

    expect((await app.inject({ method: 'PUT', url, payload: { allowSql: 'yes' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url, payload: { allowSql: true, extra: 1 } })).statusCode).toBe(400);
  });

  it('answers 404 for unknown threads', async () => {
    const { app } = setup();
    close = () => app.close();
    expect((await app.inject({ url: '/api/threads/nope/policy' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: '/api/threads/nope/policy', payload: { allowSql: true } })).statusCode).toBe(404);
  });
});
