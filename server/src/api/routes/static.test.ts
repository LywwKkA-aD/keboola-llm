import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTree } from '../../test-utils/tree.ts';
import { registerStaticRoutes } from './static.ts';

let app: ReturnType<typeof Fastify> | undefined;
afterEach(async () => {
  await app?.close();
});

describe('registerStaticRoutes', () => {
  it('serves files, falls back to index.html for app routes and keeps API 404s', async () => {
    const dir = makeTree({ 'index.html': '<div id="root"></div>', 'assets/app.js': 'console.log(1)' });
    app = Fastify();
    await registerStaticRoutes(app, dir);

    const asset = await app.inject({ url: '/assets/app.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['x-content-type-options']).toBe('nosniff');

    const deepLink = await app.inject({ url: '/chat/123' });
    expect(deepLink.statusCode).toBe(200);
    expect(deepLink.body).toContain('root');
    expect(deepLink.headers['content-security-policy']).toContain("default-src 'self'");

    const api = await app.inject({ url: '/api/nope' });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: 'Not found' });
  });

  it('does nothing without a build', async () => {
    app = Fastify();
    await registerStaticRoutes(app, '/definitely/missing');
    expect((await app.inject({ url: '/' })).statusCode).toBe(404);
  });
});
