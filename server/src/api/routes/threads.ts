import type { FastifyInstance, FastifyReply } from 'fastify';
import { commandError, commandLabel, userTurn } from '../commands.ts';
import { approvalsBody, messageBody, titleBody } from '../schemas.ts';
import type { ServerDeps } from '../types.ts';

export function registerThreadRoutes(app: FastifyInstance, { runs, threads, history, deleteThread, settings, team }: ServerDeps): void {
  const findThread = (id: string, reply: FastifyReply) => {
    const thread = threads.get(id);
    if (!thread) reply.code(404).send({ error: 'Thread not found' });
    return thread;
  };

  /** The message of a request body as a run input, or undefined after answering 400 for one the team cannot follow. */
  const turnOf = (body: unknown, reply: FastifyReply) => {
    const { text, command } = messageBody.parse(body);
    const info = team();
    const error = commandError(text, command, info);
    if (error) {
      reply.code(400).send({ error });
      return undefined;
    }
    return { title: text || (command ? commandLabel(command) : ''), input: userTurn(text, command, info) };
  };

  // resumable: the chat's last run stopped before it finished (failed, stopped, cut off by a restart).
  app.get('/api/threads', async () => {
    const unfinished = new Set(runs.resumable());
    return threads.list().map((thread) => (unfinished.has(thread.id) ? { ...thread, resumable: true } : thread));
  });

  app.post('/api/threads', async (request, reply) => {
    const turn = turnOf(request.body, reply);
    if (!turn) return reply;
    const thread = threads.create(turn.title);
    if (settings.get().allowSqlByDefault) threads.setPolicy(thread.id, { allowSql: true });
    const { runId } = runs.start(thread.id, turn.input);
    return reply.code(201).send({ thread, runId });
  });

  app.get<{ Params: { id: string } }>('/api/threads/:id/messages', async (request, reply) => {
    if (!findThread(request.params.id, reply)) return reply;
    return history(request.params.id);
  });

  app.post<{ Params: { id: string } }>('/api/threads/:id/messages', async (request, reply) => {
    if (!findThread(request.params.id, reply)) return reply;
    const turn = turnOf(request.body, reply);
    if (!turn) return reply;
    const { runId } = runs.start(request.params.id, turn.input);
    threads.touch(request.params.id);
    return reply.code(202).send({ runId });
  });

  app.get<{ Params: { id: string } }>('/api/threads/:id/approvals', async (request, reply) => {
    if (!findThread(request.params.id, reply)) return reply;
    return runs.pending(request.params.id);
  });

  app.post<{ Params: { id: string } }>('/api/threads/:id/approvals', async (request, reply) => {
    if (!findThread(request.params.id, reply)) return reply;
    const { answers } = approvalsBody.parse(request.body);
    const { runId } = runs.answer(request.params.id, answers);
    return reply.code(202).send({ runId });
  });

  // Continue a run that stopped before it finished, from its last step (409 while busy, waiting or done).
  app.post<{ Params: { id: string } }>('/api/threads/:id/resume', async (request, reply) => {
    if (!findThread(request.params.id, reply)) return reply;
    const { runId } = runs.resume(request.params.id);
    return reply.code(202).send({ runId });
  });

  app.post<{ Params: { id: string } }>('/api/threads/:id/cancel', async (request, reply) => {
    if (!findThread(request.params.id, reply)) return reply;
    return { cancelled: runs.cancel(request.params.id) };
  });

  app.patch<{ Params: { id: string } }>('/api/threads/:id', async (request, reply) => {
    if (!findThread(request.params.id, reply)) return reply;
    const { title } = titleBody.parse(request.body);
    threads.rename(request.params.id, title);
    return threads.get(request.params.id);
  });

  app.delete<{ Params: { id: string } }>('/api/threads/:id', async (request, reply) => {
    if (!findThread(request.params.id, reply)) return reply;
    if (runs.isBusy(request.params.id)) runs.cancel(request.params.id);
    runs.discard(request.params.id);
    await deleteThread(request.params.id);
    threads.remove(request.params.id);
    return reply.code(204).send();
  });
}
