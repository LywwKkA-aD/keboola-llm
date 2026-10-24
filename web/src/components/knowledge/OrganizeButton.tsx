import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';

/** Start a chat asking knowledge-keeper to tidy the knowledge base, and link to it while it works. */
export function OrganizeButton() {
  const { t } = useSettings();
  const { live } = useLive();
  const [threadId, setThreadId] = useState<string>();
  const [seenRunning, setSeenRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const runningNow = threadId !== undefined && live.running.includes(threadId);
  // The run starts a moment after the chat is created: count it as working until it has been seen to end.
  const working = threadId !== undefined && (runningNow || !seenRunning);

  useEffect(() => {
    if (runningNow) setSeenRunning(true);
  }, [runningNow]);

  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const { thread } = await api.createThread(t('knowledge.organizePrompt'));
      setSeenRunning(false);
      setThreadId(thread.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="organize">
      {threadId && (
        <span className="organize__status" role="status">
          {working && <span className="dot dot--blue dot--pulse" />}
          {t(working ? 'knowledge.organizing' : 'knowledge.organizeDone')} <Link to={`/chat/${threadId}`}>{t('knowledge.openChat')}</Link>
        </span>
      )}
      {!working && (
        <button type="button" className="btn" disabled={busy} onClick={() => void start()}>
          {t('knowledge.organize')}
        </button>
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
