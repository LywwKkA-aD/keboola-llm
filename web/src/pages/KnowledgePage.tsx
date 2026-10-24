import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { type Draft, isDirty } from '../components/knowledge/draft.ts';
import { MemoryPanel } from '../components/knowledge/MemoryPanel.tsx';
import { NotesPanel } from '../components/knowledge/NotesPanel.tsx';
import { OrganizeButton } from '../components/knowledge/OrganizeButton.tsx';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard.tsx';
import type { StringKey } from '../i18n/strings.ts';
import { useSettings } from '../state/settings-context.tsx';

type Tab = 'notes' | 'memory';

const TABS: readonly (readonly [Tab, StringKey])[] = [
  ['notes', 'knowledge.tabNotes'],
  ['memory', 'knowledge.tabMemory'],
];

/**
 * Teach the team without editing files: the knowledge base agents see as /knowledge/ and the shared memory
 * in /memories/. One draft at a time lives here, so every way out of an unsaved edit can be guarded.
 */
export function KnowledgePage() {
  const { t } = useSettings();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'memory' ? 'memory' : 'notes';
  const [draft, setDraft] = useState<Draft>();
  const discard = useCallback(() => setDraft(undefined), []);
  const { confirm, dialog } = useUnsavedGuard(isDirty(draft), discard);

  const panelProps = { draft, setDraft, confirm };

  return (
    <div className="knowledge">
      <header className="knowledge__head">
        <div>
          <span className="label">{t('knowledge.label')}</span>
          <h1 className="page__title">{t('knowledge.title')}</h1>
        </div>
        <OrganizeButton />
      </header>
      <div className="tabs" role="tablist" aria-label={t('knowledge.label')}>
        {TABS.map(([value, key]) => (
          <button
            key={value}
            id={`knowledge-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={tab === value}
            aria-controls="knowledge-panel"
            className={`tabs__tab${tab === value ? ' tabs__tab--active' : ''}`}
            onClick={() => {
              if (value !== tab) confirm(() => setParams(value === 'memory' ? { tab: 'memory' } : {}));
            }}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <div id="knowledge-panel" role="tabpanel" aria-labelledby={`knowledge-tab-${tab}`} className="knowledge__panel">
        {tab === 'notes' ? <NotesPanel {...panelProps} /> : <MemoryPanel {...panelProps} />}
      </div>
      {dialog}
    </div>
  );
}
