import { NavLink } from 'react-router';
import type { Thread } from '../api/types.ts';
import { formatClock } from '../lib/format.ts';
import { useLive } from '../live/live-context.tsx';
import type { StringKey } from '../i18n/strings.ts';
import { useSettings } from '../state/settings-context.tsx';

const STATE_KEY: Record<'running' | 'waiting' | 'idle', StringKey> = {
  running: 'chat.status.running',
  waiting: 'chat.status.waiting',
  idle: 'chat.status.idle',
};

export function ThreadList({ threads, onNew, onDelete }: {
  threads: readonly Thread[];
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const { t, settings } = useSettings();
  const { live } = useLive();
  const stateOf = (id: string): keyof typeof STATE_KEY =>
    live.running.includes(id) ? 'running' : live.waiting.includes(id) ? 'waiting' : 'idle';

  return (
    <nav className="threads" aria-label={t('nav.chats')}>
      <button type="button" className="btn threads__new" onClick={onNew}>
        {t('chat.new')}
      </button>
      <ul className="threads__list">
        {threads.map((thread) => {
          const state = stateOf(thread.id);
          return (
            <li key={thread.id} className="threads__item">
              <NavLink to={`/chat/${thread.id}`} className={({ isActive }) => `threads__link${isActive ? ' threads__link--active' : ''}`}>
                {thread.title}
              </NavLink>
              <div className="threads__meta">
                <span className={`dot${state === 'running' ? ' dot--blue dot--pulse' : state === 'waiting' ? ' dot--amber' : ''}`} />
                <span className="label">{t(STATE_KEY[state])}</span>
                <time className="threads__time mono">{formatClock(Date.parse(thread.updatedAt), settings.language)}</time>
                <button type="button" className="threads__delete" aria-label={t('chat.delete')} title={t('chat.delete')} onClick={() => onDelete(thread.id)}>
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
