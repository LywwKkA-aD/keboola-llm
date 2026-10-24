import type { FastifyInstance } from 'fastify';
import type { Envelope } from '../bus.ts';

/** What the team did lately in any chat (activity.ts), for the agent cards after a page reload. */
export function registerActivityRoutes(app: FastifyInstance, activity: (() => readonly Envelope[]) | undefined): void {
  app.get('/api/activity', async () => activity?.() ?? []);
}
