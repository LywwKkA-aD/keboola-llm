import type { FailureReason } from '../api/types.ts';
import type { StringKey } from '../i18n/strings.ts';
import { useSettings } from '../state/settings-context.tsx';

const MESSAGE: Record<FailureReason, StringKey> = {
  stopped: 'chat.failure.stopped',
  model_unavailable: 'chat.failure.model_unavailable',
  model_rejected: 'chat.failure.model_rejected',
  step_limit: 'chat.failure.step_limit',
  error: 'chat.failed',
};

/**
 * Why the team stopped before finishing, next to the button that lets it continue from its last step.
 * Without a failure the run was cut off with no reason known, e.g. by a server restart.
 */
export function RunNotice({ failure, detail, busy, onContinue }: {
  failure?: FailureReason;
  detail?: string | undefined;
  busy: boolean;
  onContinue: () => void;
}) {
  const { t } = useSettings();
  const paused = failure === undefined || failure === 'stopped';
  // Stopping needs no details; the server's own wording is for real errors.
  const shownDetail = paused ? undefined : detail;
  return (
    <div className={`run-notice${paused ? ' run-notice--paused' : ''}`} role="alert">
      <div className="run-notice__text">
        <span>{t(failure ? MESSAGE[failure] : 'chat.interrupted')}</span>
        {shownDetail && <span className="run-notice__detail mono">{shownDetail}</span>}
      </div>
      <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={onContinue}>
        {t('chat.continue')}
      </button>
    </div>
  );
}
