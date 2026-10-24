import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { type Cron, parseCron } from '../routines/cron.ts';
import { isValidTimeZone } from '../routines/zone.ts';
import { parseFrontmatter } from './frontmatter.ts';
import { type LoadError, type LoadResult, NAME_RE } from './types.ts';

/** Same cap as a chat message typed in the UI. */
const MAX_PROMPT_CHARS = 20_000;

export const routineFrontmatterSchema = z
  .object({
    name: z.string().regex(NAME_RE, 'lowercase letters, digits and dashes, 2-63 chars'),
    // Chats of a run are titled "<title> · <date>"; defaults to the name in sentence case.
    title: z.string().trim().min(1).max(40).optional(),
    description: z.string().trim().min(10).max(1024),
    // 5-field cron: minute hour day-of-month month day-of-week.
    schedule: z.string().superRefine((value, context) => {
      try {
        parseCron(value);
      } catch (error) {
        context.addIssue({ code: 'custom', message: (error as Error).message });
      }
    }),
    // IANA zone of the schedule; empty means the machine's.
    timezone: z.string().refine(isValidTimeZone, 'unknown time zone; use an IANA name such as Europe/Prague').optional(),
    // The default for every installation; the user's switch in Settings overrides it.
    enabled: z.boolean().default(false),
  })
  .strict();

export interface RoutineDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** The cron expression, whitespace normalized. */
  readonly schedule: string;
  readonly cron: Cron;
  readonly timezone?: string;
  readonly enabled: boolean;
  /** The message the run sends to the lead agent. */
  readonly prompt: string;
  /** Repo-relative path with forward slashes, e.g. routines/morning-check.md (safe to show in the UI). */
  readonly file: string;
}

type FileResult = { readonly routine: RoutineDefinition } | { readonly error: LoadError };

const titleOf = (name: string) => `${name.charAt(0).toUpperCase()}${name.slice(1).replaceAll('-', ' ')}`;

/** Load every routines/<name>.md under rootDir. Bad files are reported, never fatal; no folder means no routines. */
export function loadRoutines(rootDir: string): LoadResult<RoutineDefinition> {
  const dir = join(rootDir, 'routines');
  if (!existsSync(dir)) return { items: [], errors: [] };

  const results = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => loadRoutineFile(join(dir, entry.name), entry.name));

  return {
    items: results.flatMap((result) => ('routine' in result ? [result.routine] : [])).toSorted((a, b) => a.name.localeCompare(b.name)),
    errors: results.flatMap((result) => ('error' in result ? [result.error] : [])),
  };
}

function loadRoutineFile(path: string, fileName: string): FileResult {
  const file = `routines/${fileName}`;
  const fail = (message: string): FileResult => ({ error: { file, message } });
  try {
    const { data, body } = parseFrontmatter(readFileSync(path, 'utf8'));
    const parsed = routineFrontmatterSchema.safeParse(data);
    if (!parsed.success) return fail(z.prettifyError(parsed.error));

    const { name, title, description, schedule, timezone, enabled } = parsed.data;
    const base = fileName.slice(0, -'.md'.length);
    if (name !== base) return fail(`name "${name}" must match its file name "${base}"`);
    if (!body) return fail('no message: write what the lead agent should do below the frontmatter');
    if (body.length > MAX_PROMPT_CHARS) return fail(`the message is longer than ${MAX_PROMPT_CHARS} characters`);

    const cron = parseCron(schedule);
    return {
      routine: {
        name,
        title: title ?? titleOf(name),
        description,
        schedule: cron.source,
        cron,
        ...(timezone ? { timezone } : {}),
        enabled,
        prompt: body,
        file,
      },
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
