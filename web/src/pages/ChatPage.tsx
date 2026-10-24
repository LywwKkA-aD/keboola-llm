import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../api/client.ts';
import type { Thread } from '../api/types.ts';
import { Composer } from '../components/Composer.tsx';
import { Conversation } from '../components/Conversation.tsx';
import { ThreadList } from '../components/ThreadList.tsx';
import { useSettings } from '../state/settings-context.tsx';
import { useTeam } from '../state/team-context.tsx';

export function ChatPage() {
  const { t } = useSettings();
  const { threadId } = useParams();
  const navigate = useNavigate();
  const team = useTeam();
  const [threads, setThreads] = useState<readonly Thread[]>([]);
  const [error, setError] = useState<string>();

  const refresh = useCallback(() => {
    api.threads().then(setThreads).catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  const current = threads.find((thread) => thread.id === threadId);

  const start = async (text: string) => {
    try {
      const { thread } = await api.createThread(text);
      refresh();
      navigate(`/chat/${thread.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('error.generic'));
    }
  };

  const remove = async (id: string) => {
    await api.remove(id).catch(() => {});
    refresh();
    if (id === threadId) navigate('/chat');
  };

  return (
    <div className="chat-page">
      <ThreadList threads={threads} onNew={() => navigate('/chat')} onDelete={(id) => void remove(id)} />
      {threadId ? (
        // Keyed by the lead too: the event reducer filters chat tokens by the lead name, known only after /api/team.
        <Conversation
          key={`${threadId}:${team.lead}`}
          threadId={threadId}
          title={current?.title ?? ''}
          {...(current ? { updatedAt: current.updatedAt } : {})}
          resumable={current?.resumable === true}
          onActivity={refresh}
        />
      ) : (
        <div className="chat-page__start">
          <span className="label">{t('chat.new')}</span>
          <p className="conversation__empty">{t('chat.empty')}</p>
          {error && <div className="conversation__status conversation__status--error">{error}</div>}
          <Composer onSend={(text) => void start(text)} onStop={() => {}} running={false} disabled={false} />
        </div>
      )}
    </div>
  );
}
