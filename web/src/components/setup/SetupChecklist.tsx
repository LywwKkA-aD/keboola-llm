import { useState } from 'react';
import { useSettings } from '../../state/settings-context.tsx';
import { detectOs } from './commands.ts';
import { SetupStepRow } from './SetupStepRow.tsx';
import type { SetupState } from './useSetup.ts';
import './setup.css';

/** The first-run checklist with what to do about each failed step; used on Home and in Settings. */
export function SetupChecklist({ setup }: { setup: SetupState }) {
  const { t } = useSettings();
  const [os] = useState(() => detectOs());
  const { report, error, checking, refresh } = setup;
  const recheck = () => refresh(true);
  const changed = () => refresh(false);
  const loadError = error === undefined ? undefined : <div className="error-banner">{`${t('setup.loadError')}: ${error}`}</div>;
  const recheckButton = (
    <button type="button" className="btn btn--small" disabled={checking} onClick={recheck}>
      {checking ? t('setup.checking') : t('setup.checkAgain')}
    </button>
  );

  if (!report) {
    return error === undefined ? (
      <p className="setup__checking muted">{t('setup.checking')}</p>
    ) : (
      <div className="setup">
        {loadError}
        <div className="setup__done">{recheckButton}</div>
      </div>
    );
  }

  return (
    <div className="setup">
      <ol className="setup__steps" aria-label={t('setup.section')}>
        {report.steps.map((step, index) => (
          <SetupStepRow
            key={step.id}
            step={step}
            number={index + 1}
            report={report}
            os={os}
            checking={checking}
            onRecheck={recheck}
            onChanged={changed}
          />
        ))}
      </ol>
      {loadError}
      {report.complete && (
        <div className="setup__done">
          <span className="chip chip--green">{t('setup.complete')}</span>
          {recheckButton}
        </div>
      )}
    </div>
  );
}
