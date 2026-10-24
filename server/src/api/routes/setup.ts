import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { SetupService } from '../../setup/service.ts';
import { omnirouteBody, setupQuery } from '../schemas.ts';

/** 4xx from validation or Fastify itself (bad JSON, wrong content type); anything else is ours. */
const clientStatus = (error: FastifyError): number | undefined =>
  error instanceof ZodError ? 400 : error.statusCode !== undefined && error.statusCode < 500 ? error.statusCode : undefined;

/**
 * First-run setup: the checklist, the model test and the write-only OmniRoute key. A request here may
 * carry the key, so errors stay generic: no parser or validation message can quote it back, and the
 * answers only ever say whether a key is set.
 */
export function registerSetupRoutes(app: FastifyInstance, setup: SetupService): void {
  void app.register(async (scope) => {
    scope.setErrorHandler((error: FastifyError, _request, reply) => {
      const status = clientStatus(error);
      if (status !== undefined) return reply.code(status).send({ error: 'Invalid request' });
      // The code only (EACCES when .env is read-only): messages may quote paths or upstream text.
      console.error(`[setup] request failed: ${error.code ?? error.name}`);
      return reply.code(500).send({ error: 'Internal error' });
    });

    scope.get('/api/setup', async (request) => setup.report({ retest: setupQuery.parse(request.query).retest === '1' }));

    scope.post('/api/setup/test-model', async () => setup.testModel());

    scope.post('/api/setup/omniroute', async (request) => setup.saveOmniRoute(omnirouteBody.parse(request.body)));
  });
}
