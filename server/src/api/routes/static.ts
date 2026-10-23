import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};

/** Serve the built web app (web/dist) with a single-page-app fallback, when it exists. */
export async function registerStaticRoutes(app: FastifyInstance, staticDir: string | undefined): Promise<void> {
  if (!staticDir || !existsSync(staticDir)) return;

  app.addHook('onSend', async (request, reply, payload) => {
    if (!request.url.startsWith('/api/')) reply.headers(SECURITY_HEADERS);
    return payload;
  });

  await app.register(fastifyStatic, { root: staticDir, wildcard: false });

  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/')) return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'Not found' });
  });
}
