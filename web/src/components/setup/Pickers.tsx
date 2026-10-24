import { useState } from 'react';
import { setupApi } from '../../api/client.ts';
import type { ModelTest, SetupReport } from '../../api/setup-types.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { Select, type SelectOption } from '../Select.tsx';

const failure = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

/** Choose the team's model among those OmniRoute offers, and send it a test request. */
export function ModelPicker({ report, onChanged }: { report: SetupReport; onChanged: () => void }) {
  const { t, update } = useSettings();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ModelTest>();
  const [error, setError] = useState<string>();
  const current = report.effective.model;
  const options: readonly SelectOption<string>[] = [
    ...(current ? [] : [['', t('setup.model.choose')] as const]),
    ...(current && !report.models.includes(current) ? [[current, current] as const] : []),
    ...report.models.map((id) => [id, id] as const),
  ];

  const choose = (model: string) => {
    if (!model || model === current) return;
    setResult(undefined);
    setError(undefined);
    update({ model }).then(onChanged, (reason: unknown) => setError(failure(reason, t('error.generic'))));
  };

  const test = () => {
    setTesting(true);
    setError(undefined);
    setupApi
      .testModel()
      .then(
        (next) => {
          setResult(next);
          onChanged();
        },
        (reason: unknown) => setError(failure(reason, t('error.generic'))),
      )
      .finally(() => setTesting(false));
  };

  return (
    <div className="setup-step__controls">
      <div className="setup-step__row">
        <Select<string> aria-label={t('setup.model.label')} value={current} options={options} onChange={choose} />
        <button type="button" className="btn btn--small" disabled={testing || !current} onClick={test}>
          {testing ? t('setup.model.testing') : t('setup.model.test')}
        </button>
      </div>
      {result && (
        <p className={result.ok ? 'setup-step__result' : 'field__error'}>
          {result.ok ? t('setup.model.answered').replace('{ms}', String(result.latencyMs)) : result.error}
        </p>
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

/** Choose the project the team works on among those registered in kbagent. */
export function ProjectPicker({ report, onChanged }: { report: SetupReport; onChanged: () => void }) {
  const { t, update } = useSettings();
  const [error, setError] = useState<string>();
  const current = report.effective.keboolaProject;
  const registered = report.projects.some((project) => project.alias === current);
  const options: readonly SelectOption<string>[] = [
    ...(registered ? [] : [['', t('setup.project.choose')] as const]),
    ...report.projects.map((project) => [project.alias, `${project.alias} · ${project.name}${project.id ? ` (${project.id})` : ''}`] as const),
  ];

  const choose = (keboolaProject: string) => {
    if (!keboolaProject || keboolaProject === current) return;
    setError(undefined);
    update({ keboolaProject }).then(onChanged, (reason: unknown) => setError(failure(reason, t('error.generic'))));
  };

  return (
    <div className="setup-step__controls">
      <Select<string> aria-label={t('setup.project.label')} value={registered ? current : ''} options={options} onChange={choose} />
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
