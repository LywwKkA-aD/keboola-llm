import type { FastifyInstance } from 'fastify';
import { routineBody } from '../schemas.ts';
import type { ServerDeps } from '../types.ts';

const NOT_FOUND = { error: 'Routine not found' };

/** Scheduled routines: list them, switch them on or off for this installation, run one now. */
export function registerRoutineRoutes(app: FastifyInstance, { routines }: Pick<ServerDeps, 'routines'>): void {
  if (!routines) return;

  app.get('/api/routines', async () => routines.list());

  app.put<{ Params: { name: string } }>('/api/routines/:name', async (request, reply) => {
    const { enabled } = routineBody.parse(request.body);
    return routines.setEnabled(request.params.name, enabled) ?? reply.code(404).send(NOT_FOUND);
  });

  // RUN_CONFLICT (409) while the routine's last run still goes.
  app.post<{ Params: { name: string } }>('/api/routines/:name/run', async (request, reply) => {
    const started = routines.runNow(request.params.name);
    return started ? reply.code(201).send(started) : reply.code(404).send(NOT_FOUND);
  });
}
