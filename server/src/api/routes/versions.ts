import type { FastifyInstance, FastifyReply } from 'fastify';
import type { z } from 'zod';
import type { DefinitionVersions } from '../../versions/tracker.ts';
import { definitionParams, versionParams } from '../schemas.ts';

function parse<T extends z.ZodType>(schema: T, params: unknown, reply: FastifyReply): z.infer<T> | undefined {
  const parsed = schema.safeParse(params);
  if (!parsed.success) reply.code(400).send({ error: 'Invalid request', issues: parsed.error.issues });
  return parsed.success ? parsed.data : undefined;
}

/**
 * Version history of agents and custom skills, and rollback. Restoring is the user's action in the UI;
 * agents have no route to it (their filesystem never reaches the data dir).
 */
export function registerVersionRoutes(app: FastifyInstance, versions: DefinitionVersions): void {
  app.get('/api/definitions/:kind', async (request, reply) => {
    const params = parse(definitionParams.pick({ kind: true }), request.params, reply);
    return params ? versions.tracked(params.kind) : reply;
  });

  app.get('/api/definitions/:kind/:name/versions', async (request, reply) => {
    const params = parse(definitionParams, request.params, reply);
    return params ? versions.list(params.kind, params.name) : reply;
  });

  app.get('/api/definitions/:kind/:name/versions/:id', async (request, reply) => {
    const params = parse(versionParams, request.params, reply);
    if (!params) return reply;
    return versions.get(params.kind, params.name, params.id) ?? reply.code(404).send({ error: 'Version not found' });
  });

  app.post('/api/definitions/:kind/:name/versions/:id/restore', async (request, reply) => {
    const params = parse(versionParams, request.params, reply);
    if (!params) return reply;
    const result = versions.restore(params.kind, params.name, params.id);
    if (result.ok) return { changed: result.changed, ...(result.version ? { version: result.version } : {}) };
    return result.reason === 'not-found'
      ? reply.code(404).send({ error: 'Version not found' })
      : reply.code(409).send({ error: 'This version records a deletion; restore an earlier one' });
  });
}
