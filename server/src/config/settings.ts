import { type FileIo, defaultIo, readJsonFile, writeJsonAtomic } from '../storage/json-file.ts';
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

/**
 * Load user settings; a missing file yields the defaults (missing fields too). A corrupt or invalid one is kept aside
 * (settings.json.corrupt-<time>) before the defaults are used, so a save cannot silently overwrite it.
 */
export function loadSettings(file: string, io: FileIo = defaultIo): Settings {
  return readJsonFile<Settings>(file, {
    fallback: DEFAULT_SETTINGS,
    io,
    parse: (raw) => {
      const parsed = settingsSchema.safeParse(raw);
      return parsed.success ? parsed.data : undefined;
    },
  });
}

/** Validate current + patch, write it atomically and return the new settings. */
export function saveSettings(file: string, current: Settings, patch: Partial<Settings>, io: FileIo = defaultIo): Settings {
  const next = settingsSchema.parse({ ...current, ...patch });
  writeJsonAtomic(file, next, { io });
  return next;
}
