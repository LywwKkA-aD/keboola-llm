import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { isAllowedRequest } from './guard.ts';
import { registerEventRoutes } from './routes/events.ts';
import { registerKnowledgeRoutes } from './routes/knowledge.ts';
import { registerMemoryRoutes } from './routes/memory.ts';
import { registerMetaRoutes } from './routes/meta.ts';
import { registerOnboardingRoutes } from './routes/onboarding.ts';
import { registerPolicyRoutes } from './routes/policies.ts';
import { registerRoutineRoutes } from './routes/routines.ts';
import { registerPromotionRoutes } from './routes/promotions.ts';
import { registerSetupRoutes } from './routes/setup.ts';
import { registerStaticRoutes } from './routes/static.ts';
import { registerThreadRoutes } from './routes/threads.ts';
import { registerVersionRoutes } from './routes/versions.ts';
import { registerWorkspaceRoutes } from './routes/workspace.ts';
import type { RunErrorCode } from './runs.ts';
import type { ServerDeps } from './types.ts';

export type { ServerDeps } from './types.ts';

const STATUS_BY_CODE: Record<RunErrorCode, number> = { RUN_CONFLICT: 409, RUN_INVALID: 400 };

export async function createServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });

  app.addHook('onRequest', async (request, reply) => {
    const allowed = isAllowedRequest({ host: request.headers.host, origin: request.headers.origin }, deps.allowed);
    if (!allowed) await reply.code(403).send({ error: 'Forbidden' });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: 'Invalid request', issues: error.issues });
    const { code, statusCode, message } = error as { code?: string; statusCode?: number; message?: string };
    if (code === 'RUN_CONFLICT' || code === 'RUN_INVALID') return reply.code(STATUS_BY_CODE[code]).send({ error: message });
    const status = statusCode ?? 500;
    return reply.code(status).send({ error: status >= 500 ? 'Internal error' : message });
  });

  registerMetaRoutes(app, deps);
  registerThreadRoutes(app, deps);
  registerPolicyRoutes(app, deps);
  registerWorkspaceRoutes(app, deps);
  registerOnboardingRoutes(app, deps);
  if (deps.setup) registerSetupRoutes(app, deps.setup);
  if (deps.promotionPreview) registerPromotionRoutes(app, deps.promotionPreview);
  registerEventRoutes(app, deps);
  if (deps.versions) registerVersionRoutes(app, deps.versions);
  registerRoutineRoutes(app, deps);
  registerKnowledgeRoutes(app, deps);
  registerMemoryRoutes(app, deps);
  await registerStaticRoutes(app, deps.staticDir);
  return app;
}
