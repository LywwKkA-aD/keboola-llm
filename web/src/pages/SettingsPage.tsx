import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import type { KeboolaProject, Language, Quality, ReduceMotion, Settings, Theme } from '../api/types.ts';
import { EnvSelect, Segmented, SettingsSection } from '../components/settings/fields.tsx';
import { SystemChecks } from '../components/settings/SystemChecks.tsx';
import { LANGUAGE_NAMES } from '../i18n/strings.ts';
import { useSettings } from '../state/settings-context.tsx';

const LANGUAGES = Object.keys(LANGUAGE_NAMES) as Language[];

export function SettingsPage() {
  const { t, settings, update } = useSettings();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [models, setModels] = useState<readonly string[]>([]);
  const [modelsFailed, setModelsFailed] = useState(false);
  const [projects, setProjects] = useState<readonly KeboolaProject[]>([]);
  const [projectsFailed, setProjectsFailed] = useState(false);
  const [memory, setMemory] = useState<string>();

  useEffect(() => {
    api.models().then((result) => setModels(result.models), () => setModelsFailed(true));
    api.keboolaProjects().then((result) => setProjects(result.projects), () => setProjectsFailed(true));
    api.memory().then((result) => setMemory(result.content), () => setMemory(''));
  }, []);

  const save = async (patch: Partial<Settings>) => {
    setSaved(false);
    setError(undefined);
    try {
      await update(patch);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('error.generic'));
    }
  };

  return (
    <div className="page">
      <header className="page__head page__head--row">
        <div>
          <span className="label">{t('settings.label')}</span>
          <h1 className="page__title">{t('settings.title')}</h1>
        </div>
        <span className="settings__saved" role="status">
          {saved && <span className="chip chip--green">{t('settings.saved')}</span>}
        </span>
      </header>
      {error && <div className="error-banner">{error}</div>}

      <SettingsSection title={t('settings.interface')}>
        <label className="field">
          <span className="label">{t('settings.language')}</span>
          <select className="select" value={settings.language} onChange={(event) => void save({ language: event.target.value as Language })}>
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NAMES[code]}
              </option>
            ))}
          </select>
        </label>
        <Segmented<Theme>
          label={t('settings.theme')}
          value={settings.theme}
          options={[
            ['dark', t('theme.dark')],
            ['light', t('theme.light')],
            ['system', t('theme.system')],
          ]}
          onChange={(theme) => void save({ theme })}
        />
        <Segmented<Quality>
          label={t('settings.quality')}
          value={settings.quality}
          options={[
            ['high', t('quality.high')],
            ['medium', t('quality.medium')],
            ['low', t('quality.low')],
          ]}
          onChange={(quality) => void save({ quality })}
        />
        <Segmented<ReduceMotion>
          label={t('settings.motion')}
          value={settings.reduceMotion}
          options={[
            ['system', t('motion.system')],
            ['on', t('motion.on')],
            ['off', t('motion.off')],
          ]}
          onChange={(reduceMotion) => void save({ reduceMotion })}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.models')}>
        <EnvSelect
          label={t('settings.model')}
          value={settings.model}
          options={models.map((id) => [id, id] as const)}
          envLabel={t('settings.fromEnv')}
          {...(modelsFailed ? { error: t('settings.modelsError') } : {})}
          onChange={(model) => void save({ model })}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.keboola')}>
        <EnvSelect
          label={t('settings.project')}
          value={settings.keboolaProject}
          options={projects.map((project) => [project.alias, `${project.alias} · ${project.name}${project.id ? ` (${project.id})` : ''}`] as const)}
          envLabel={t('settings.fromEnv')}
          {...(projectsFailed ? { error: t('settings.projectsError') } : {})}
          onChange={(keboolaProject) => void save({ keboolaProject })}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.safety')} hint={t('settings.allowSqlHint')}>
        <label className="toggle">
          <input type="checkbox" checked={settings.allowSqlByDefault} onChange={(event) => void save({ allowSqlByDefault: event.target.checked })} />
          <span>{t('settings.allowSql')}</span>
        </label>
      </SettingsSection>

      <SettingsSection title={t('settings.memory')} hint={t('settings.memoryHint')}>
        {memory ? <pre className="memory">{memory}</pre> : <p className="empty">{memory === undefined ? '…' : t('settings.memoryEmpty')}</p>}
      </SettingsSection>

      <SettingsSection title={t('settings.system')}>
        <SystemChecks />
      </SettingsSection>
    </div>
  );
}
