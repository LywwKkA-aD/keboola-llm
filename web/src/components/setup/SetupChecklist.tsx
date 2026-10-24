import { useId, useState } from 'react';
import { useSettings } from '../../state/settings-context.tsx';
import { detectOs } from './commands.ts';
import { SetupStepRow } from './SetupStepRow.tsx';
import type { SetupState } from './useSetup.ts';
import './setup.css';

/**
 * The first-run checklist with what to do about each failed step; used on Home and in Settings. Once every step
 * passes it folds into one summary line, unless a step failed while this page was open: then the steps stay in
 * view to show that the fix worked.
 */
export function SetupChecklist({ setup }: { setup: SetupState }) {
  const { t } = useSettings();
  const listId = useId();
  const [os] = useState(() => detectOs());
  // The user's own choice to show or hide the steps of a complete checklist.
  const [shown, setShown] = useState<boolean>();
  const [failedHere, setFailedHere] = useState(false);
  const { report, error, checking, refresh } = setup;
  if (report && !report.complete && !failedHere) setFailedHere(true);
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

  const open = !report.complete || (shown ?? failedHere);
  const total = report.steps.length;

  return (
    <div className="setup">
      {report.complete && (
        <div className="setup__summary">
          <span className="dot dot--green" aria-hidden="true" />
          <span className="setup__summary-text">
            {t('setup.summary').replace('{done}', String(total)).replace('{total}', String(total))}
          </span>
          <button type="button" className="btn btn--ghost btn--small" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setShown(!open)}>
            {open ? t('setup.hideSteps') : t('setup.showSteps')}
          </button>
          {recheckButton}
        </div>
      )}
      {open && (
        <ol id={listId} className="setup__steps" aria-label={t('setup.section')}>
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
      )}
      {loadError}
    </div>
  );
}
