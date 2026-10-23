import { useState } from 'react';
import type { Language } from '../api/types.ts';
import { LANGUAGE_NAMES } from '../i18n/strings.ts';
import { useSettings } from '../state/settings-context.tsx';

const LANGUAGES = Object.keys(LANGUAGE_NAMES) as Language[];

export function SettingsPage() {
  const { t, settings, setLanguage } = useSettings();
  const [saved, setSaved] = useState(false);

  const change = async (language: Language) => {
    setSaved(false);
    await setLanguage(language);
    setSaved(true);
  };

  return (
    <div className="page page--narrow">
      <h1 className="page__title">{t('settings.title')}</h1>
      <label className="field">
        <span className="field__label">{t('settings.language')}</span>
        <select className="field__input" value={settings.language} onChange={(event) => void change(event.target.value as Language)}>
          {LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>
      </label>
      {saved && <p className="field__hint">{t('settings.saved')}</p>}
    </div>
  );
}
