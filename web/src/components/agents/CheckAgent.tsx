import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.ts';
import { useThreadEvents } from '../../hooks/useThreadEvents.ts';
import type { StringKey } from '../../i18n/strings.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { useTeam } from '../../state/team-context.tsx';

type CheckState = 'running' | 'waiting' | 'failed' | 'done';

const STATE: Record<CheckState, { readonly dot: string; readonly text: StringKey }> = {
  running: { dot: 'dot dot--blue dot--pulse', text: 'agents.checkRunning' },
  waiting: { dot: 'dot dot--amber dot--pulse', text: 'chat.waiting' },
  failed: { dot: 'dot dot--red', text: 'chat.failed' },
  done: { dot: 'dot dot--green', text: 'agents.checkDone' },
};

function CheckStatus({ threadId }: { threadId: string }) {
  const { t } = useSettings();
  const team = useTeam();
  const [ended, setEnded] = useState(false);
  const run = useThreadEvents(threadId, team.lead, () => setEnded(true));
  // Until the run's first event arrives the new chat counts as running.
  const state: CheckState = run.status === 'failed' || run.status === 'waiting' ? run.status : ended && run.status === 'idle' ? 'done' : 'running';

  return (
    <p className="check-agent__status">
      <span className={STATE[state].dot} />
      <span>{t(STATE[state].text)}</span>
      <Link to={`/chat/${threadId}`}>{t('agents.checkOpen')}</Link>
    </p>
  );
}

/** "Check agent": a chat in which the lead gives the agent one small read-only task and reports how it went. */
export function CheckAgent({ name }: { name: string }) {
  const { t } = useSettings();
  const [threadId, setThreadId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const start = () => {
    setBusy(true);
    setError(undefined);
    api
      .createThread(t('agents.checkPrompt').replace('{agent}', name))
      .then(({ thread }) => setThreadId(thread.id))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t('error.generic')))
      .finally(() => setBusy(false));
  };

  return (
    <div className="panel-section check-agent">
      <div className="panel-section__head">
        <span className="label">{t('agents.checkTitle')}</span>
      </div>
      <p className="check-agent__hint">{t('agents.checkHint')}</p>
      {threadId ? (
        <CheckStatus threadId={threadId} />
      ) : (
        <button type="button" className="btn btn--small" disabled={busy} onClick={start}>
          {t('agents.check')}
        </button>
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
