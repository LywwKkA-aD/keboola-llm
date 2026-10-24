import { useState } from 'react';
import type { NoteSummary } from '../../api/knowledge.ts';
import { groupNotes } from '../../lib/notes.ts';
import { useSettings } from '../../state/settings-context.tsx';

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Notes grouped by folder, with a filter over titles and paths. */
export function NoteList({ notes, selected, onSelect }: { notes: readonly NoteSummary[] | undefined; selected?: string | undefined; onSelect: (path: string) => void }) {
  const { t } = useSettings();
  const [filter, setFilter] = useState('');
  const groups = groupNotes(notes ?? [], filter);

  const body = () => {
    if (notes === undefined) return <p className="empty">…</p>;
    if (notes.length === 0) return <p className="empty">{t('knowledge.empty')}</p>;
    if (groups.length === 0) return <p className="empty">{t('knowledge.noMatch')}</p>;
    return groups.map((group) => (
      <div key={group.folder} className="note-group">
        <span className={`label note-group__name${group.folder ? ' mono' : ''}`}>{group.folder ? `${group.folder}/` : t('knowledge.topLevel')}</span>
        <ul className="note-list">
          {group.notes.map((note) => (
            <li key={note.path}>
              <button
                type="button"
                className={`note-item${note.path === selected ? ' note-item--selected' : ''}`}
                aria-current={note.path === selected ? 'true' : undefined}
                onClick={() => onSelect(note.path)}
              >
                <span className="note-item__title">{note.title}</span>
                <span className="note-item__file mono">{fileName(note.path)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    ));
  };

  return (
    <div className="note-browser">
      <input
        type="search"
        className="input"
        aria-label={t('knowledge.filter')}
        placeholder={t('knowledge.filter')}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <div className="note-browser__groups">{body()}</div>
    </div>
  );
}
