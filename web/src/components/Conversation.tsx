import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.ts';
import type { ChatEntry, Decision } from '../api/types.ts';
import { friendlyError, isConflict } from '../lib/errors.ts';
import type { PendingApproval } from '../state/run-state.ts';
import type { CommandActions, Outgoing } from '../hooks/useCommandField.ts';
import { useThreadEvents } from '../hooks/useThreadEvents.ts';
import { useSettings } from '../state/settings-context.tsx';
import { useTeam } from '../state/team-context.tsx';
import { ApprovalCard } from './ApprovalCard.tsx';
import { Composer } from './Composer.tsx';
import { MessageBubble } from './MessageBubble.tsx';
import { RunNotice } from './RunNotice.tsx';
import { SqlToggle } from './SqlToggle.tsx';
import { StepRows } from './StepRows.tsx';
import { formatClock } from '../lib/format.ts';
import { timeline } from '../lib/timeline.ts';
import type { StringKey } from '../i18n/strings.ts';
import type { RunStatus } from '../state/run-state.ts';

const STATUS: Record<RunStatus, [StringKey, string]> = {
  idle: ['chat.status.idle', ''],
  running: ['chat.status.running', 'chip--blue'],
  waiting: ['chat.status.waiting', 'chip--amber'],
  failed: ['chat.status.failed', 'chip--red'],
};
const INTERRUPTED: [StringKey, string] = ['chat.status.interrupted', 'chip--red'];

/** A message this page sent, and how many user messages with its text the server's history had then. */
interface SentMessage {
  readonly entry: ChatEntry;
  readonly seen: number;
}

const userTexts = (history: readonly ChatEntry[], text: string) => history.filter((entry) => entry.role === 'user' && entry.text === text).length;

/** Whether the server's history now holds the sent message (one more user message with its text than before). */
const confirmed = (history: readonly ChatEntry[], message: SentMessage) => userTexts(history, message.entry.text) > message.seen;

const withSent = (history: readonly ChatEntry[], sent: readonly SentMessage[]) =>
  sent.length === 0 ? history : [...history, ...sent.filter((message) => !confirmed(history, message)).map((message) => message.entry)];

/** Within a line or two of the bottom: new output may scroll the view. */
export const isNearBottom = (box: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>) => box.scrollHeight - box.scrollTop - box.clientHeight < 80;

/**
 * One chat: header, history, the steps the team took, the live stream of the lead agent, approvals and the composer.
 * resumable: the server holds an unfinished run for this chat (e.g. one a restart cut off) that can be continued.
 */
export function Conversation({ threadId, title, updatedAt, resumable = false, onActivity, actions = {} }: {
  threadId: string;
  title: string;
  updatedAt?: string;
  resumable?: boolean;
  onActivity: () => void;
  /** The page's own commands (/init, /new); /sql this chat carries out itself. */
  actions?: Pick<CommandActions, 'init' | 'newChat'>;
}) {
  const { t, settings } = useSettings();
  const team = useTeam();
  const [serverHistory, setServerHistory] = useState<readonly ChatEntry[]>([]);
  // Messages sent from this page that the server's history does not show yet: kept on screen until it does.
  const [sent, setSent] = useState<readonly SentMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  // Follow new output only while the user is at the bottom; scrolling up to read stays put.
  const following = useRef(true);

  const history = useMemo(() => withSent(serverHistory, sent), [serverHistory, sent]);

  const loadHistory = useCallback(() => {
    api
      .history(threadId)
      .then((entries) => {
        setServerHistory(entries);
        setSent((current) => current.filter((message) => !confirmed(entries, message)));
      })
      .catch((reason: Error) => setError(reason.message));
  }, [threadId]);

  const reload = useCallback(() => {
    loadHistory();
    onActivity();
  }, [loadHistory, onActivity]);

  // What waits for an answer comes from the server, not from the events this page happened to see: an approval
  // answered elsewhere, or one restored after a restart, must not linger or be missing. The events say when to ask.
  const [pending, setPending] = useState<readonly PendingApproval[]>([]);
  const loadPending = useCallback(() => {
    api.approvals(threadId).then(setPending, () => {});
  }, [threadId]);
  useEffect(() => setPending([]), [threadId]);

  const { run, resync } = useThreadEvents(threadId, team.lead, {
    onRunEnd: reload,
    // A turn this page did not start (another tab, a routine): its message is in the server's history.
    onNewTurn: loadHistory,
    onReconnect: () => {
      reload();
      loadPending();
    },
  });
  useEffect(loadPending, [loadPending, run.approvals, run.status]);
  const [allowSql, setAllowSql] = useState(false);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    api.policy(threadId).then((policy) => setAllowSql(policy.allowSql)).catch(() => {});
  }, [threadId]);

  const saveSql = async (allowed: boolean) => setAllowSql((await api.setPolicy(threadId, { allowSql: allowed })).allowSql);
  const changeSql = (allowed: boolean) => void guard(() => saveSql(allowed));

  useEffect(() => {
    if (following.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [history, run.streamingText, pending.length]);
  const onScroll = () => {
    const box = messagesRef.current;
    if (box) following.current = isNearBottom(box);
  };

  /** Run an API call with the busy flag and error banner; resolves to whether it succeeded. */
  const guard = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      return true;
    } catch (reason) {
      setError(friendlyError(reason, t));
      // The server says this page is out of date (answered elsewhere, run already going): show what is true now.
      if (isConflict(reason)) {
        loadPending();
        resync();
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Resolves to whether the server took the message; the composer keeps the text when it did not. */
  const send = async ({ text, command }: Outgoing): Promise<boolean> => {
    const local: SentMessage = {
      entry: { id: `local-${Date.now()}`, role: 'user', text, ...(command ? { command } : {}) },
      seen: userTexts(serverHistory, text),
    };
    following.current = true;
    setSent((current) => [...current, local]);
    const accepted = await guard(() => api.send(threadId, text, command));
    // The server did not take it (e.g. the chat is busy): do not pretend it was sent.
    if (!accepted) setSent((current) => current.filter((message) => message !== local));
    return accepted;
  };

  const answer = (interruptId: string, decisions: Decision[]) =>
    void guard(() => api.answer(threadId, [{ interruptId, decisions }])).then(loadPending);

  // The chat list learns the run is no longer unfinished.
  const resume = () =>
    void guard(() => api.resume(threadId)).then((resumed) => {
      if (resumed) onActivity();
    });

  const running = run.status === 'running';
  const showStream = (running || run.status === 'waiting') && run.streamingText;
  // An unfinished run, e.g. one a server restart cut off: offer to continue it. The server's word, once asked, wins
  // over the chat list's.
  const interrupted = run.status === 'idle' && (run.resumable ?? (resumable && run.turns === 0));
  const items = useMemo(() => timeline(history, run.activities, run.turns), [history, run.activities, run.turns]);

  const [statusKey, statusChip] = interrupted ? INTERRUPTED : STATUS[run.status];

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
        <div className="conversation__messages" ref={messagesRef} onScroll={onScroll}>
          {history.length === 0 && !running && <p className="conversation__empty">{t('chat.empty')}</p>}
          {items.map((item) =>
            item.kind === 'entry' ? (
              <MessageBubble key={item.entry.id} role={item.entry.role} text={item.entry.text} {...(item.entry.command ? { command: item.entry.command } : {})} />
            ) : (
              <StepRows key={`turn-${item.turn}`} steps={item.steps} />
            ),
          )}
          {showStream && <MessageBubble role="assistant" text={run.streamingText} pending />}
          {running && <div className="conversation__status conversation__status--working">{t('chat.working')}</div>}
          {(run.status === 'waiting' || pending.length > 0) && <div className="conversation__status">{t('chat.waiting')}</div>}
          {pending.map((approval) => (
            <ApprovalCard key={approval.interruptId} approval={approval} busy={busy} onAnswer={(decisions) => answer(approval.interruptId, decisions)} />
          ))}
          {run.status === 'failed' && <RunNotice failure={run.failure ?? 'error'} detail={run.error} busy={busy} onContinue={resume} />}
          {interrupted && <RunNotice busy={busy} onContinue={resume} />}
          {error && <div className="conversation__status conversation__status--error">{error}</div>}
          <div ref={endRef} />
        </div>
        {pending.length > 0 && <p className="conversation__hint">{t('chat.answerFirst')}</p>}
        <Composer
          onSend={send}
          onStop={() => void guard(() => api.cancel(threadId))}
          running={running}
          disabled={busy || pending.length > 0 || run.status === 'waiting'}
          actions={{ ...actions, sql: saveSql }}
        />
      </div>
    </div>
  );
}
