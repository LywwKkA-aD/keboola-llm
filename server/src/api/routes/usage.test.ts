import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_HOST, testDeps } from '../../test-utils/server-deps.ts';
import { reportOf } from '../../usage/ledger.ts';
import { createServer } from '../server.ts';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('usage route', () => {
  it('returns the token report', async () => {
    const report = reportOf({}, '2026-10-24');
    app = await createServer(testDeps({ usage: () => report }));
    const response = await app.inject({ url: '/api/usage', headers: TEST_HOST });
    expect(response.json()).toEqual(report);
  });

  it('does not exist without a usage store', async () => {
    app = await createServer(testDeps());
    expect((await app.inject({ url: '/api/usage', headers: TEST_HOST })).statusCode).toBe(404);
  });
});
