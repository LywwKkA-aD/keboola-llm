import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ServerDeps } from '../types.ts';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Answer 502 when an upstream (OmniRoute, kbagent) cannot help; the message never carries secrets. */
async function upstream<T>(reply: FastifyReply, load: () => Promise<T>): Promise<T | FastifyReply> {
  try {
    return await load();
  } catch (error) {
    return reply.code(502).send({ error: message(error) });
  }
}

/** Cross-chat views and the read-only system information behind the top bar and the Settings page. */
export function registerWorkspaceRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const { runs, threads } = deps;
  const pendingApprovals = () =>
    threads.list().flatMap((thread) =>
      runs.pending(thread.id).map((approval) => ({
        threadId: thread.id,
        threadTitle: thread.title,
        interruptId: approval.interruptId,
        requests: approval.requests,
      })),
    );

  app.get('/api/approvals', async () => pendingApprovals());

  app.get('/api/status', async () => ({
    ...deps.effective(),
    version: deps.version,
    activeRuns: runs.active().length,
    pendingApprovals: pendingApprovals().length,
  }));

  app.get('/api/models', async (_request, reply) =>
    upstream(reply, async () => ({ models: await deps.models(), current: deps.effective().model })),
  );

  app.get('/api/keboola/projects', async (_request, reply) =>
    upstream(reply, async () => ({ projects: await deps.keboolaProjects(), current: deps.effective().keboolaProject })),
  );

  app.get('/api/system', async () => deps.system());
}
