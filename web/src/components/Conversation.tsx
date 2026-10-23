import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.ts';
import type { ChatEntry, Decision } from '../api/types.ts';
import { useThreadEvents } from '../hooks/useThreadEvents.ts';
import { useSettings } from '../state/settings-context.tsx';
import { useTeam } from '../state/team-context.tsx';
import { ApprovalCard } from './ApprovalCard.tsx';
import { Composer } from './Composer.tsx';
import { MessageBubble } from './MessageBubble.tsx';
import { SqlToggle } from './SqlToggle.tsx';
import { StepRows } from './StepRows.tsx';
import { formatClock } from '../lib/format.ts';
import type { StringKey } from '../i18n/strings.ts';
import type { RunStatus } from '../state/run-state.ts';

const STATUS: Record<RunStatus, [StringKey, string]> = {
  idle: ['chat.status.idle', ''],
  running: ['chat.status.running', 'chip--blue'],
  waiting: ['chat.status.waiting', 'chip--amber'],
  failed: ['chat.status.failed', 'chip--red'],
};

/** One chat: header, history, the steps the team took, the live stream of the lead agent, approvals and the composer. */
export function Conversation({ threadId, title, updatedAt, onActivity }: {
  threadId: string;
  title: string;
  updatedAt?: string;
  onActivity: () => void;
}) {
  const { t, settings } = useSettings();
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
  const [allowSql, setAllowSql] = useState(false);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    api.policy(threadId).then((policy) => setAllowSql(policy.allowSql)).catch(() => {});
  }, [threadId]);

  const changeSql = (allowed: boolean) =>
    void guard(async () => setAllowSql((await api.setPolicy(threadId, { allowSql: allowed })).allowSql));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [history, run.streamingText, run.approvals.length]);

  /** Run an API call with the busy flag and error banner; resolves to whether it succeeded. */
  const guard = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('error.generic'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = (text: string) => {
    const local: ChatEntry = { id: `local-${Date.now()}`, role: 'user', text };
    setHistory((current) => [...current, local]);
    void guard(() => api.send(threadId, text)).then((sent) => {
      // The server did not take it (e.g. the chat is busy): do not pretend it was sent.
      if (!sent) setHistory((current) => current.filter((entry) => entry.id !== local.id));
    });
  };

  const answer = (interruptId: string, decisions: Decision[]) =>
    void guard(() => api.answer(threadId, [{ interruptId, decisions }]));

  const running = run.status === 'running';
  const showStream = (running || run.status === 'waiting') && run.streamingText;

  const [statusKey, statusChip] = STATUS[run.status];

  return (
    <div className="conversation">
      <div className="conversation__main">
        <header className="conversation__head">
          <div>
            <span className="label">
              {t('chat.label')} · #{threadId.slice(0, 8)}
              {updatedAt ? ` · ${formatClock(Date.parse(updatedAt), settings.language)}` : ''}
            </span>
            <h1 className="conversation__title">{title}</h1>
          </div>
          <div className="conversation__tools">
            <span className={`chip ${statusChip}`}>{t(statusKey)}</span>
            <SqlToggle checked={allowSql} onChange={changeSql} disabled={busy} />
          </div>
        </header>
        <div className="conversation__messages">
          {history.length === 0 && !running && <p className="conversation__empty">{t('chat.empty')}</p>}
          {history.map((entry) => (
            <MessageBubble key={entry.id} role={entry.role} text={entry.text} />
          ))}
          <StepRows steps={run.activities} />
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
    </div>
  );
}
