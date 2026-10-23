import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.ts';
import type { ChatEntry, Decision } from '../api/types.ts';
import { useThreadEvents } from '../hooks/useThreadEvents.ts';
import { useSettings } from '../state/settings-context.tsx';
import { useTeam } from '../state/team-context.tsx';
import { ActivityPanel } from './ActivityPanel.tsx';
import { ApprovalCard } from './ApprovalCard.tsx';
import { Composer } from './Composer.tsx';
import { MessageBubble } from './MessageBubble.tsx';

/** One chat: history, the live stream of the lead agent, approvals, composer and activity side panel. */
export function Conversation({ threadId, onActivity }: { threadId: string; onActivity: () => void }) {
  const { t } = useSettings();
  const team = useTeam();
  const [history, setHistory] = useState<readonly ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const endRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => {
    api.history(threadId).then(setHistory).catch((reason: Error) => setError(reason.message));
    onActivity();
  }, [threadId, onActivity]);

  const run = useThreadEvents(threadId, team.lead, reload);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [history, run.streamingText, run.approvals.length]);

  const guard = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  const send = (text: string) => {
    setHistory((current) => [...current, { id: `local-${Date.now()}`, role: 'user', text }]);
    void guard(() => api.send(threadId, text));
  };

  const answer = (interruptId: string, decisions: Decision[]) =>
    void guard(() => api.answer(threadId, [{ interruptId, decisions }]));

  const running = run.status === 'running';
  const showStream = (running || run.status === 'waiting') && run.streamingText;

  return (
    <div className="conversation">
      <div className="conversation__main">
        <div className="conversation__messages">
          {history.length === 0 && !running && <p className="conversation__empty">{t('chat.empty')}</p>}
          {history.map((entry) => (
            <MessageBubble key={entry.id} role={entry.role} text={entry.text} />
          ))}
          {showStream && <MessageBubble role="assistant" text={run.streamingText} pending />}
          {running && <div className="conversation__status conversation__status--working">{t('chat.working')}</div>}
          {run.status === 'waiting' && <div className="conversation__status">{t('chat.waiting')}</div>}
          {run.approvals.map((approval) => (
            <ApprovalCard key={approval.interruptId} approval={approval} busy={busy} onAnswer={(decisions) => answer(approval.interruptId, decisions)} />
          ))}
          {run.status === 'failed' && <div className="conversation__status conversation__status--error">{t('chat.failed')}: {run.error}</div>}
          {error && <div className="conversation__status conversation__status--error">{error}</div>}
          <div ref={endRef} />
        </div>
        <Composer onSend={send} onStop={() => void guard(() => api.cancel(threadId))} running={running} disabled={busy || run.status === 'waiting'} />
      </div>
      <ActivityPanel run={run} />
    </div>
  );
}
