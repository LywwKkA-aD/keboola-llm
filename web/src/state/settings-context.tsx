import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.ts';
import type { Language, Settings } from '../api/types.ts';
import { type StringKey, translate } from '../i18n/strings.ts';

interface SettingsValue {
  readonly settings: Settings;
  readonly setLanguage: (language: Language) => Promise<void>;
  readonly t: (key: StringKey) => string;
}

const DEFAULT_SETTINGS: Settings = { language: 'ru' };

const SettingsContext = createContext<SettingsValue>({
  settings: DEFAULT_SETTINGS,
  setLanguage: async () => {},
  t: (key) => translate(DEFAULT_SETTINGS.language, key),
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    api.settings().then(setSettings).catch(() => {});
  }, []);

  const setLanguage = useCallback(async (language: Language) => {
    setSettings(await api.saveSettings({ language }));
  }, []);

  const value = useMemo<SettingsValue>(
    () => ({ settings, setLanguage, t: (key) => translate(settings.language, key) }),
    [settings, setLanguage],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
