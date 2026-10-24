import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.ts';
import type { OnboardingStatus } from '../../api/types.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';

/** First run: offer project-scout's survey of a Keboola project the team has not profiled yet. */
export function OnboardingCard() {
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

  if (!status?.project || status.profiled) return null;
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
