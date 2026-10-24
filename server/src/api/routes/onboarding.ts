import type { FastifyInstance } from 'fastify';
import { textBody } from '../schemas.ts';
import type { ServerDeps } from '../types.ts';

/** First run: has project-scout profiled the project, and one survey chat at a time to do it. */
export function registerOnboardingRoutes(app: FastifyInstance, { runs, threads, onboarding }: Pick<ServerDeps, 'runs' | 'threads' | 'onboarding'>): void {
  // Project alias -> its survey chat. In memory only: after a restart Home simply offers the survey again.
  const surveys = new Map<string, string>();
  const surveyOf = (project: string) => {
    const threadId = surveys.get(project);
    return threadId && threads.get(threadId) ? threadId : undefined;
  };

  app.get('/api/onboarding', async () => {
    const status = await onboarding();
    const threadId = surveyOf(status.project);
    return threadId ? { ...status, threadId, running: runs.isBusy(threadId) } : { ...status, running: false };
  });

  app.post('/api/onboarding/start', async (request, reply) => {
    const { text } = textBody.parse(request.body);
    const { project } = await onboarding();
    if (!project) return reply.code(409).send({ error: 'No Keboola project is set up in kbagent' });
    const running = surveyOf(project);
    if (running && runs.isBusy(running)) return { threadId: running };
    const thread = threads.create(text);
    runs.start(thread.id, { messages: [{ role: 'user', content: text }] });
    surveys.set(project, thread.id);
    return reply.code(201).send({ threadId: thread.id });
  });
}
