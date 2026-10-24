import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client.ts';
import { routinesApi } from '../api/routines.ts';
import { useLive } from '../live/live-context.tsx';
import type { Signal } from '../live/signals.ts';
import { useSettings } from '../state/settings-context.tsx';
import { useTeam } from '../state/team-context.tsx';
import { showNotice } from './browser.ts';
import { type NoticeContext, noticeFor } from './notice.ts';

const isHidden = () => document.visibilityState === 'hidden';

/** The chat's title and whether it is a routine run; what cannot be read stays unknown. */
async function contextOf(signal: Signal, lead: string): Promise<NoticeContext> {
  const [threads, routines] = await Promise.all([
    api.threads().catch(() => []),
    signal.kind === 'finished' ? routinesApi.list().then((list) => list.routines, () => []) : [],
  ]);
  return {
    chatTitle: threads.find((thread) => thread.id === signal.threadId)?.title,
    routine: routines.some((routine) => routine.lastRun?.threadId === signal.threadId),
    lead,
  };
}

/**
 * While the tab is hidden and the user switched notifications on, one desktop notification per approval
 * asked and per run ended, one per chat at a time. Clicking one opens its chat; coming back clears them.
 */
export function useDesktopNotifications(): void {
  const { live } = useLive();
  const { settings, t } = useSettings();
  const { lead } = useTeam();
  const navigate = useNavigate();
  // The newest signal already looked at; undefined until the first render, so nothing older is announced.
  const handled = useRef<number | undefined>(undefined);
  const shown = useRef<ReadonlyMap<string, Notification>>(new Map());
  const enabled = settings.desktopNotifications;

  useEffect(() => {
    const latest = live.signals.at(-1)?.id ?? 0;
    const from = handled.current ?? latest;
    handled.current = latest;
    if (!enabled || !isHidden()) return;
    live.signals
      .filter((signal) => signal.id > from)
      .forEach((signal) => {
        void contextOf(signal, lead).then((context) => {
          // The user may have come back while the chat title loaded.
          if (!isHidden()) return;
          const notice = noticeFor(signal, context, t);
          const notification = showNotice(notice, () => {
            window.focus();
            void navigate(`/chat/${signal.threadId}`);
          });
          if (notification) shown.current = new Map([...shown.current, [notice.tag, notification]]);
        });
      });
  }, [live.signals, enabled, lead, t, navigate]);

  useEffect(() => {
    const clear = () => {
      if (isHidden()) return;
      shown.current.forEach((notification) => notification.close());
      shown.current = new Map();
    };
    document.addEventListener('visibilitychange', clear);
    return () => document.removeEventListener('visibilitychange', clear);
  }, []);
}
