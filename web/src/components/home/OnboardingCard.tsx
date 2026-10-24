import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import type { OnboardingStatus } from '../../api/types.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import { SetupChecklist } from '../setup/SetupChecklist.tsx';
import { type SetupState, useSetup } from '../setup/useSetup.ts';
import { FloatingCard } from './FloatingCard.tsx';

/** First run on Home: the setup checklist while a step fails, then the offer to init the workspace. */
export function OnboardingCard({ onOpenChat }: { onOpenChat: (threadId: string) => void }) {
  const setup = useSetup();
  // Nothing until the first check is back: a set-up app should not flash the checklist.
  if (!setup.report) return setup.error === undefined ? null : <SetupCard setup={setup} />;
  return setup.report.complete ? <SurveyCard onOpenChat={onOpenChat} /> : <SetupCard setup={setup} />;
}

/** The checklist while a step still fails. */
function SetupCard({ setup }: { setup: SetupState }) {
  const { t } = useSettings();
  return (
    <FloatingCard title={t('setup.title')} tone="warning">
      <p className="float-card__text">{t('setup.intro')}</p>
      <SetupChecklist setup={setup} />
    </FloatingCard>
  );
}

/** Offer "init workspace" (map + documentation of production) for a project the team does not know yet. */
function SurveyCard({ onOpenChat }: { onOpenChat: (threadId: string) => void }) {
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
  const { project, threadId } = status;

  const start = () => {
    setBusy(true);
    setError(undefined);
    api
      .startOnboarding(t('onboarding.prompt').replace('{project}', project))
      .then((started) => setStatus({ ...status, threadId: started.threadId, running: true }))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t('error.generic')))
      .finally(() => setBusy(false));
  };

  return (
    <FloatingCard title={t('onboarding.title')} tone="primary">
      {status.running && threadId ? (
        <div className="float-card__row">
          <span className="dot dot--blue dot--pulse" />
          <span className="float-card__text">{t('onboarding.running')}</span>
          <button type="button" className="btn btn--small" onClick={() => onOpenChat(threadId)}>
            {t('onboarding.open')}
          </button>
        </div>
      ) : (
        <>
          <p className="float-card__text">{t('onboarding.text').replace('{project}', project)}</p>
          <button type="button" className="btn btn--primary float-card__action" disabled={busy} onClick={start}>
            {t('onboarding.start')}
          </button>
        </>
      )}
      {error && <div className="error-banner">{error}</div>}
    </FloatingCard>
  );
}
