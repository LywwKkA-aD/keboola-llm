import type { FastifyInstance } from 'fastify';
import type { UsageReport } from '../../usage/ledger.ts';

/** Tokens by day and agent, cache reads and writes included (the Home usage panel). */
export function registerUsageRoutes(app: FastifyInstance, usage: () => UsageReport): void {
  app.get('/api/usage', async () => usage());
}
