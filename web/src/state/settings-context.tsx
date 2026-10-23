import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.ts';
import { DEFAULT_SETTINGS, type Settings } from '../api/types.ts';
import { type StringKey, translate } from '../i18n/strings.ts';
import { type Appearance, applyAppearance, resolveAppearance } from './appearance.ts';

interface SettingsValue {
  readonly settings: Settings;
  readonly appearance: Appearance;
  /** Save a partial change on the server and adopt what it stored. */
  readonly update: (patch: Partial<Settings>) => Promise<void>;
  readonly t: (key: StringKey) => string;
}

const SettingsContext = createContext<SettingsValue>({
  settings: DEFAULT_SETTINGS,
  appearance: resolveAppearance(DEFAULT_SETTINGS, () => false),
  update: async () => {},
  t: (key) => translate(DEFAULT_SETTINGS.language, key),
});

const MEDIA_QUERIES = ['(prefers-color-scheme: light)', '(prefers-reduced-motion: reduce)'];

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // Bumped when the operating system switches theme or motion, so "system" choices follow live.
  const [mediaTick, setMediaTick] = useState(0);

  useEffect(() => {
    api
      .settings()
      .then((stored) => setSettings({ ...DEFAULT_SETTINGS, ...stored }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const lists = MEDIA_QUERIES.map((query) => window.matchMedia(query));
    const onChange = () => setMediaTick((tick) => tick + 1);
    lists.forEach((list) => list.addEventListener?.('change', onChange));
    return () => lists.forEach((list) => list.removeEventListener?.('change', onChange));
  }, []);

  // mediaTick is not read inside: it only forces a fresh look at the media queries.
  const appearance = useMemo(() => resolveAppearance(settings), [settings, mediaTick]);

  useEffect(() => {
    applyAppearance(document.documentElement, appearance, settings.language);
  }, [appearance, settings.language]);

  const update = useCallback(async (patch: Partial<Settings>) => {
    const stored = await api.saveSettings(patch);
    setSettings({ ...DEFAULT_SETTINGS, ...stored });
  }, []);

  const value = useMemo<SettingsValue>(
    () => ({ settings, appearance, update, t: (key) => translate(settings.language, key) }),
    [settings, appearance, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
