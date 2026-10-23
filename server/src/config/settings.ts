import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

const settingsSchema = z.object({
  language: z.enum(['ru', 'en', 'cs']).default('ru'),
});

export type Settings = z.infer<typeof settingsSchema>;

const DEFAULTS: Settings = settingsSchema.parse({});

/** Load user settings; a missing, corrupt or invalid file yields the defaults. */
export function loadSettings(file: string): Settings {
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** Validate current + patch, write it atomically and return the new settings. */
export function saveSettings(file: string, current: Settings, patch: Partial<Settings>): Settings {
  const next = settingsSchema.parse({ ...current, ...patch });
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(temp, file);
  return next;
}
