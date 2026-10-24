import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.ts';
import type { Thread } from '../../api/types.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { useTeam } from '../../state/team-context.tsx';
import { Conversation } from '../Conversation.tsx';

/**
 * One chat in a large floating panel next to the aquarium, so the team stays in view while it works.
 * Non-modal: takes focus when it opens and gives it back to where it came from when it closes.
 */
export function ChatPopup({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const { t } = useSettings();
  const team = useTeam();
  const popup = useRef<HTMLElement>(null);
  const [thread, setThread] = useState<Thread>();

  const refresh = useCallback(() => {
    api
      .threads()
      .then((threads) => setThread(threads.find((entry) => entry.id === threadId)))
      .catch(() => {});
  }, [threadId]);

  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const node = popup.current;
    node?.focus();
    return () => {
      if (node?.contains(document.activeElement) && previous?.isConnected) previous.focus();
    };
  }, []);

  return (
    <section ref={popup} className="hud-surface chat-popup" role="dialog" aria-label={t('chat.label')} tabIndex={-1}>
      <div className="chat-popup__bar">
        <Link className="btn btn--ghost btn--small" to={`/chat/${threadId}`}>
          {t('home.openInChats')}
        </Link>
        <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
          {t('home.close')}
        </button>
      </div>
      {/* Keyed by the lead too: the event reducer filters chat tokens by the lead name, known only after /api/team. */}
      <Conversation
        key={`${threadId}:${team.lead}`}
        threadId={threadId}
        title={thread?.title ?? ''}
        {...(thread ? { updatedAt: thread.updatedAt } : {})}
        onActivity={refresh}
      />
    </section>
  );
}
