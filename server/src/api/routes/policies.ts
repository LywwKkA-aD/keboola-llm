import type { FastifyInstance } from 'fastify';
import { policyBody } from '../schemas.ts';
import type { ServerDeps } from '../types.ts';

/** Per-chat standing permissions, e.g. "allow SQL in this chat". */
export function registerPolicyRoutes(app: FastifyInstance, { threads }: Pick<ServerDeps, 'threads'>): void {
  app.get<{ Params: { id: string } }>('/api/threads/:id/policy', async (request, reply) => {
    const policy = threads.policy(request.params.id);
    return policy ?? reply.code(404).send({ error: 'Thread not found' });
  });

  app.put<{ Params: { id: string } }>('/api/threads/:id/policy', async (request, reply) => {
    if (!threads.policy(request.params.id)) return reply.code(404).send({ error: 'Thread not found' });
    const parsed = policyBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid request', issues: parsed.error.issues });
    threads.setPolicy(request.params.id, parsed.data);
    return threads.policy(request.params.id);
  });
}
