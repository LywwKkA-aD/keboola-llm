import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.ts';
import { useThreadEvents } from '../../hooks/useThreadEvents.ts';
import type { StringKey } from '../../i18n/strings.ts';
import type { RunStatus } from '../../state/run-state.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { useTeam } from '../../state/team-context.tsx';
import { MessageBubble } from '../MessageBubble.tsx';

const STATUS_KEY: Record<RunStatus, StringKey> = {
  idle: 'chat.status.idle',
  running: 'chat.status.running',
  waiting: 'chat.status.waiting',
  failed: 'chat.status.failed',
};

function LiveReply({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const { t } = useSettings();
  const team = useTeam();
  const [open, setOpen] = useState(true);
  const [final, setFinal] = useState<string>();
  const run = useThreadEvents(threadId, team.lead, () => {
    api
      .history(threadId)
      .then((entries) => setFinal(entries.filter((entry) => entry.role === 'assistant').at(-1)?.text))
      .catch(() => {});
  });
  const text = run.status === 'running' || !final ? run.streamingText : final;

  return (
    <div className="ask__drawer">
      <div className="ask__drawer-head">
        <span className="label">{t(STATUS_KEY[run.status])}</span>
        <div className="ask__drawer-actions">
          <Link className="btn btn--small" to={`/chat/${threadId}`}>
            {t('home.openChat')}
          </Link>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen((value) => !value)}>
            {t(open ? 'home.hide' : 'home.show')}
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
            {t('home.close')}
          </button>
        </div>
      </div>
      {open && (
        <div className="ask__reply">
          {text ? <MessageBubble role="assistant" text={text} pending={run.status === 'running'} /> : <p className="empty">{t('chat.working')}</p>}
          {run.status === 'failed' && <div className="error-banner">{run.error}</div>}
        </div>
      )}
    </div>
  );
}

/** "Ask the team" on the home page: starts a new chat and shows its reply in place. */
export function AskTeam() {
  const { t } = useSettings();
  const [text, setText] = useState('');
  const [threadId, setThreadId] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const { thread } = await api.createThread(trimmed);
      setThreadId(thread.id);
      setText('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ask">
      {threadId && <LiveReply key={threadId} threadId={threadId} onClose={() => setThreadId(undefined)} />}
      {error && <div className="error-banner">{error}</div>}
      <form
        className="ask__form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <span className="label ask__label">{t('home.ask')}</span>
        <input
          className="input ask__input"
          aria-label={t('home.ask')}
          placeholder={t('home.askPlaceholder')}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={busy || !text.trim()}>
          {t('chat.send')}
        </button>
      </form>
    </div>
  );
}
