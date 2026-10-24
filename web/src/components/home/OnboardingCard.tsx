import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.ts';
import type { OnboardingStatus } from '../../api/types.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import { SetupCard } from '../setup/SetupPanels.tsx';
import { useSetup } from '../setup/useSetup.ts';

/** First run on Home: the setup checklist while a step fails, then the offer to init the workspace. */
export function OnboardingCard() {
  const setup = useSetup();
  // Nothing until the first check is back: a set-up app should not flash the checklist.
  if (!setup.report) return setup.error === undefined ? null : <SetupCard setup={setup} />;
  return setup.report.complete ? <SurveyCard /> : <SetupCard setup={setup} />;
}

/** Offer "init workspace" (map + documentation of production) for a project the team does not know yet. */
function SurveyCard() {
  const { t } = useSettings();
  const { live } = useLive();
  const [status, setStatus] = useState<OnboardingStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const runningKey = live.running.join(',');

  const load = useCallback(() => {
    api.onboarding().then(setStatus, () => setStatus(undefined));
  }, []);
  // Recheck whenever a run starts or ends: the survey's end is when the profile appears.
  useEffect(load, [load, runningKey]);

  // The map (profile) lands first; the card stays while the rest of the init still runs.
  if (!status?.project || (status.profiled && !status.running)) return null;
  const { project } = status;

  const start = () => {
    setBusy(true);
    setError(undefined);
    api
      .startOnboarding(t('onboarding.prompt').replace('{project}', project))
      .then(({ threadId }) => setStatus({ ...status, threadId, running: true }))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t('error.generic')))
      .finally(() => setBusy(false));
  };

  return (
    <section className="panel-section onboarding" aria-labelledby="onboarding-title">
      <h2 id="onboarding-title" className="onboarding__title">
        {t('onboarding.title')}
      </h2>
      {status.running && status.threadId ? (
        <p className="onboarding__text">
          <span className="dot dot--blue dot--pulse" /> {t('onboarding.running')} <Link to={`/chat/${status.threadId}`}>{t('onboarding.open')}</Link>
        </p>
      ) : (
        <>
          <p className="onboarding__text">{t('onboarding.text').replace('{project}', project)}</p>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={start}>
            {t('onboarding.start')}
          </button>
        </>
      )}
      {error && <div className="error-banner">{error}</div>}
    </section>
  );
}
