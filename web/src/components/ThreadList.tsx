import { NavLink } from 'react-router';
import type { Thread } from '../api/types.ts';
import { useSettings } from '../state/settings-context.tsx';

export function ThreadList({ threads, onNew, onDelete }: {
  threads: readonly Thread[];
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useSettings();
  return (
    <nav className="threads" aria-label={t('nav.chat')}>
      <button type="button" className="btn btn--primary threads__new" onClick={onNew}>
        + {t('chat.new')}
      </button>
      <ul className="threads__list">
        {threads.map((thread) => (
          <li key={thread.id} className="threads__item">
            <NavLink to={`/chat/${thread.id}`} className={({ isActive }) => `threads__link${isActive ? ' threads__link--active' : ''}`}>
              {thread.title}
            </NavLink>
            <button type="button" className="threads__delete" aria-label={t('chat.delete')} title={t('chat.delete')} onClick={() => onDelete(thread.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
