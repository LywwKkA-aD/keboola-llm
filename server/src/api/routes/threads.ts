import type { FastifyInstance, FastifyReply } from 'fastify';
import { approvalsBody, messageBody, titleBody } from '../schemas.ts';
import type { ServerDeps } from '../types.ts';

const userMessage = (text: string) => ({ messages: [{ role: 'user', content: text }] });

export function registerThreadRoutes(app: FastifyInstance, { runs, threads, history, deleteThread }: ServerDeps): void {
  const findThread = (id: string, reply: FastifyReply) => {
    const thread = threads.get(id);
    if (!thread) reply.code(404).send({ error: 'Thread not found' });
    return thread;
  };

  app.get('/api/threads', async () => threads.list());

  app.post('/api/threads', async (request, reply) => {
    const { text } = messageBody.parse(request.body);
    const thread = threads.create(text);
    const { runId } = runs.start(thread.id, userMessage(text));
    return reply.code(201).send({ thread, runId });
  });

  app.get<{ Params: { id: string } }>('/api/threads/:id/messages', async (request, reply) => {
    if (!findThread(request.params.id, reply)) return reply;
    return history(request.params.id);
  });

  app.post<{ Params: { id: string } }>('/api/threads/:id/messages', async (request, reply) => {
    if (!findThread(request.params.id, reply)) return reply;
    const { text } = messageBody.parse(request.body);
    const { runId } = runs.start(request.params.id, userMessage(text));
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
    await deleteThread(request.params.id);
    threads.remove(request.params.id);
    return reply.code(204).send();
  });
}
