import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

const fields = {
  language: z.enum(['ru', 'en', 'cs']),
  theme: z.enum(['dark', 'light', 'system']),
  quality: z.enum(['high', 'medium', 'low']),
  reduceMotion: z.enum(['on', 'off', 'system']),
  // Empty means "use OMNIROUTE_MODEL from .env".
  model: z.string().trim().max(200),
  // Empty means "use KEBOOLA_PROJECT from .env". Aliases are passed to kbagent, so keep them plain.
  keboolaProject: z.string().trim().max(100).regex(/^[A-Za-z0-9._-]*$/, 'letters, digits, dot, dash, underscore'),
  allowSqlByDefault: z.boolean(),
  // Desktop notifications while the tab is in the background; the browser's own permission still applies.
  desktopNotifications: z.boolean(),
};

const settingsSchema = z.object({
  language: fields.language.default('ru'),
  theme: fields.theme.default('dark'),
  quality: fields.quality.default('high'),
  reduceMotion: fields.reduceMotion.default('system'),
  model: fields.model.default(''),
  keboolaProject: fields.keboolaProject.default(''),
  allowSqlByDefault: fields.allowSqlByDefault.default(false),
  desktopNotifications: fields.desktopNotifications.default(false),
});

/** A partial update from the UI: only the sent fields, never defaults, nothing unknown. */
export const settingsPatchSchema = z.object(fields).partial().strict();

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

/** Load user settings; a missing, corrupt or invalid file yields the defaults. Missing fields get defaults. */
export function loadSettings(file: string): Settings {
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
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
