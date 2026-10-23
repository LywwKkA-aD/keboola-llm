import { z } from 'zod';

export const messageBody = z.object({ text: z.string().trim().min(1).max(20_000) });

export const titleBody = z.object({ title: z.string().trim().min(1).max(200) });

export const settingsBody = z.object({ language: z.enum(['ru', 'en', 'cs']) }).partial().strict();

export const policyBody = z.object({ allowSql: z.boolean() }).strict();

const decision = z.discriminatedUnion('type', [
  z.object({ type: z.literal('approve') }),
  z.object({ type: z.literal('reject'), message: z.string().max(2000).optional() }),
]);

export const approvalsBody = z.object({
  answers: z.array(z.object({ interruptId: z.string().min(1), decisions: z.array(decision) })),
});

export const eventsQuery = z.object({
  threadId: z.string().optional(),
  after: z.coerce.number().int().nonnegative().optional(),
});
