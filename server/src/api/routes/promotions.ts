import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PromotionPreview } from '../../system/promotion.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const previewQuery = z.object({ componentId: z.string().regex(ID), configId: z.string().regex(ID), branchId: z.string().regex(/^\d{1,20}$/) });

export type PromotionPreviewFn = (query: z.infer<typeof previewQuery>) => Promise<PromotionPreview>;

/** What a promotion to production would change, shown in its approval card (read-only kbagent calls). */
export function registerPromotionRoutes(app: FastifyInstance, preview: PromotionPreviewFn): void {
  app.get('/api/promotions/preview', async (request, reply) => {
    const parsed = previewQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid configuration or branch id' });
    try {
      return await preview(parsed.data);
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
