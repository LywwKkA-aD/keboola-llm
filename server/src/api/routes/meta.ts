import type { FastifyInstance } from 'fastify';
import { settingsBody } from '../schemas.ts';
import type { ServerDeps } from '../types.ts';

export function registerMetaRoutes(app: FastifyInstance, { team, settings }: ServerDeps): void {
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/team', async () => team());

  app.get('/api/settings', async () => settings.get());

  app.put('/api/settings', async (request) => settings.set(settingsBody.parse(request.body)));
}
