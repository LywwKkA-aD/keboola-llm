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
/** PUT /api/routines/:name: the user's switch for one routine. */
export const routineBody = z.object({ enabled: z.boolean() }).strict();
// Knowledge base and shared memory: these fix the shape only. Paths and sizes (in bytes) are checked by the
// note store, server/src/knowledge/, which every read and write goes through.
const relativePath = z.string().min(1).max(1000);

export const notePathQuery = z.object({ path: relativePath });

// The modification time the editor opened; a save over a newer version is refused (409).
const expectedModifiedAt = z.string().max(40).optional();

export const noteBody = z.object({ path: relativePath, content: z.string(), expectedModifiedAt }).strict();

export const uploadBody = z.object({ name: z.string().min(1).max(255), content: z.string(), folder: z.string().max(1000).optional() }).strict();

export const memoryBody = z.object({ content: z.string(), expectedModifiedAt }).strict();
// First-run setup. The OmniRoute key is write-only; printable ASCII without spaces or quotes keeps it
// intact in .env. The address must be a plain http(s) URL: no credentials, query or fragment.
const isRouterUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
};

export const omnirouteBody = z
  .object({
    apiKey: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .regex(/^[\x21-\x7E]+$/)
      .refine((value) => !/['"`\\]/.test(value)),
    // The URL parser drops line breaks and tabs that .env would keep: printable ASCII only.
    baseUrl: z.string().trim().max(500).regex(/^[\x21-\x7E]+$/).refine(isRouterUrl).optional(),
  })
  .strict();

export const setupQuery = z.object({ retest: z.literal('1').optional() });
