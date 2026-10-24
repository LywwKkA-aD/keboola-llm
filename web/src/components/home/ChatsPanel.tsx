import { useEffect, useId, useState } from 'react';
import { api } from '../../api/client.ts';
import type { Thread } from '../../api/types.ts';
import { formatClock } from '../../lib/format.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import { RoutineRuns } from './RoutineRuns.tsx';

const MAX_RECENT = 8;

/** Chats panel: what runs now, the latest chats and routine runs; each opens in the chat popup. */
export function ChatsPanel({ onOpen }: { onOpen: (threadId: string) => void }) {
  const { t, settings } = useSettings();
  const { live } = useLive();
  const runningId = useId();
  const recentId = useId();
  const [threads, setThreads] = useState<readonly Thread[]>([]);
  const runningKey = live.running.join(',');

  useEffect(() => {
    api.threads().then(setThreads).catch(() => {});
  }, [runningKey]);

  const titleOf = (id: string) => threads.find((thread) => thread.id === id)?.title ?? id.slice(0, 8);
  const recent = threads
    .filter((thread) => !live.running.includes(thread.id))
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_RECENT);

  return (
    <>
      <section className="hud-section" aria-labelledby={runningId}>
        <h3 className="hud-section__title label" id={runningId}>
          {t('home.activeRuns')}
        </h3>
        {live.running.length === 0 ? (
          <p className="empty">{t('home.noRuns')}</p>
        ) : (
          <ul className="chat-list">
            {live.running.map((id) => (
              <li key={id}>
                <button type="button" className="chat-item" onClick={() => onOpen(id)}>
                  <span className="dot dot--blue dot--pulse" />
                  <span className="chat-item__title">{titleOf(id)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hud-section" aria-labelledby={recentId}>
        <h3 className="hud-section__title label" id={recentId}>
          {t('home.recentChats')}
        </h3>
        {recent.length === 0 ? (
          <p className="empty">{t('home.noChats')}</p>
        ) : (
          <ul className="chat-list">
            {recent.map((thread) => (
              <li key={thread.id}>
                <button type="button" className="chat-item" onClick={() => onOpen(thread.id)}>
                  <span className={`dot${live.waiting.includes(thread.id) ? ' dot--amber' : ''}`} />
                  <span className="chat-item__title">{thread.title}</span>
                  <time className="chat-item__when mono">{formatClock(Date.parse(thread.updatedAt), settings.language)}</time>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RoutineRuns onOpen={onOpen} />
    </>
  );
}
