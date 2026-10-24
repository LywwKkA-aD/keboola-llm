import { z } from 'zod';
import { NAME_RE } from '../registry/types.ts';
import { DEFINITION_KINDS } from '../versions/types.ts';

export const messageBody = z.object({ text: z.string().trim().min(1).max(20_000) });

export const titleBody = z.object({ title: z.string().trim().min(1).max(200) });

export { settingsPatchSchema as settingsBody } from '../config/settings.ts';

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

// Version history of agents and custom skills: the kind and name are all a file path is built from.
export const definitionParams = z.object({ kind: z.enum(DEFINITION_KINDS), name: z.string().regex(NAME_RE) });

export const versionParams = definitionParams.extend({ id: z.coerce.number().int().positive() });
