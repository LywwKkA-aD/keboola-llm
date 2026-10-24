import { useEffect, useState } from 'react';
import { versionsApi } from '../../api/client.ts';
import type { DefinitionKind, TrackedDefinition } from '../../api/types.ts';
import { formatWhen } from '../../lib/version-format.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { useTeam } from '../../state/team-context.tsx';
import { VersionHistory } from '../versions/VersionHistory.tsx';
import { Drawer, DrawerHead } from './Drawer.tsx';

/**
 * Agents or custom skills that have a history but are not in the team: deleted, or failing to load
 * after an edit. Their history is the way back.
 */
export function RemovedDefinitions({ kind, present }: { kind: DefinitionKind; present: readonly string[] }) {
  const { t, settings } = useSettings();
  const team = useTeam();
  const [tracked, setTracked] = useState<readonly TrackedDefinition[]>([]);
  const [selected, setSelected] = useState<string>();

  useEffect(() => {
    versionsApi.tracked(kind).then(setTracked, () => setTracked([]));
  }, [kind, team]);

  const missing = tracked.filter((definition) => !present.includes(definition.name));
  if (missing.length === 0) return null;
  const titleId = `removed-${kind}`;

  return (
    <section className="removed" aria-labelledby={titleId}>
      <h2 id={titleId} className="removed__title">
        {t('definitions.removed')}
      </h2>
      <p className="removed__hint">{t('definitions.removedHint')}</p>
      <ul className="removed__list">
        {missing.map((definition) => (
          <li key={definition.name}>
            <button type="button" className="removed__item" onClick={() => setSelected(definition.name)}>
              <span className="mono">{definition.name}</span>
              <span className={`chip${definition.exists ? ' chip--amber' : ' chip--red'}`}>
                {t(definition.exists ? 'definitions.broken' : 'definitions.deleted')}
              </span>
              <span className="removed__when">{formatWhen(definition.last.at, settings.language)}</span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <Drawer label={selected} onClose={() => setSelected(undefined)}>
          <DrawerHead label={t(kind === 'agents' ? 'definitions.agents' : 'definitions.skills')} title={selected} onClose={() => setSelected(undefined)} />
          <VersionHistory kind={kind} name={selected} />
        </Drawer>
      )}
    </section>
  );
}
