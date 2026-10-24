import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_HOST, testDeps } from '../../test-utils/server-deps.ts';
import { createServer } from '../server.ts';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('activity route', () => {
  it('returns the recent activity of all chats', async () => {
    const entries = [{ seq: 3, at: 1, threadId: 't1', event: { type: 'tool.start', agent: 'lead', callId: 'c', tool: 'ls', args: {} } }];
    app = await createServer(testDeps({ activity: () => entries as never }));
    const response = await app.inject({ url: '/api/activity', headers: TEST_HOST });
    expect(response.json()).toEqual(entries);
  });

  it('answers an empty list without an activity log', async () => {
    app = await createServer(testDeps());
    expect((await app.inject({ url: '/api/activity', headers: TEST_HOST })).json()).toEqual([]);
  });
});
