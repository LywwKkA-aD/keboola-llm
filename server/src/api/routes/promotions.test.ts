import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_HOST, testDeps } from '../../test-utils/server-deps.ts';
import { createServer } from '../server.ts';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('promotion preview route', () => {
  it('returns production and branch texts for the approval card', async () => {
    const preview = vi.fn(async () => ({ productionVersion: 4, production: 'SELECT 1;', branch: 'SELECT 2;' }));
    app = await createServer(testDeps({ promotionPreview: preview }));
    const response = await app.inject({ url: '/api/promotions/preview?componentId=c&configId=k1&branchId=99', headers: TEST_HOST });
    expect(response.json()).toEqual({ productionVersion: 4, production: 'SELECT 1;', branch: 'SELECT 2;' });
    expect(preview).toHaveBeenCalledWith({ componentId: 'c', configId: 'k1', branchId: '99' });
  });

  it('rejects ids that are not plain ids and explains a failed read', async () => {
    app = await createServer(testDeps({ promotionPreview: async () => Promise.reject(new Error('The configuration could not be read')) }));
    expect((await app.inject({ url: '/api/promotions/preview?componentId=c&configId=k1&branchId=x', headers: TEST_HOST })).statusCode).toBe(400);
    const failed = await app.inject({ url: '/api/promotions/preview?componentId=c&configId=k1&branchId=99', headers: TEST_HOST });
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toEqual({ error: 'The configuration could not be read' });
  });
});
