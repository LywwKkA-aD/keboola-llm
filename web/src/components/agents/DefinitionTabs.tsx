import type { DefinitionKind } from '../../api/types.ts';
import { useSettings } from '../../state/settings-context.tsx';
import './agents.css';

const TABS: readonly DefinitionKind[] = ['agents', 'skills'];

/** Agents / Skills switch at the bottom of the Agents page header. */
export function DefinitionTabs({ tab, counts, onChange }: {
  tab: DefinitionKind;
  counts: Readonly<Record<DefinitionKind, number>>;
  onChange: (tab: DefinitionKind) => void;
}) {
  const { t } = useSettings();
  return (
    <div className="tabs" role="tablist" aria-label={t('definitions.view')}>
      {TABS.map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={tab === value}
          className={`tabs__item${tab === value ? ' tabs__item--on' : ''}`}
          onClick={() => onChange(value)}
        >
          {t(value === 'agents' ? 'definitions.agents' : 'definitions.skills')}
          <span className="tabs__count">{counts[value]}</span>
        </button>
      ))}
    </div>
  );
}
