import { useCallback, useEffect, useState } from 'react';
import { versionsApi } from '../../api/client.ts';
import type { ChangeType, DefinitionKind, VersionSummary } from '../../api/types.ts';
import type { StringKey } from '../../i18n/strings.ts';
import { formatBytes, formatWhen } from '../../lib/version-format.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { useTeam } from '../../state/team-context.tsx';
import { VersionPanel } from './VersionPanel.tsx';
import './versions.css';

const CHIP: Record<ChangeType, string> = {
  baseline: 'chip',
  created: 'chip chip--green',
  changed: 'chip chip--blue',
  deleted: 'chip chip--red',
  restored: 'chip chip--amber',
};

/** History of an agent's AGENT.md or a custom skill's SKILL.md: every recorded version, newest first. */
export function VersionHistory({ kind, name }: { kind: DefinitionKind; name: string }) {
  const { t, settings } = useSettings();
  // Refetched when agents or skills change on disk, which is when a new version may have been recorded.
  const team = useTeam();
  const [versions, setVersions] = useState<readonly VersionSummary[]>();
  const [selected, setSelected] = useState<number>();
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(() => {
    versionsApi.list(kind, name).then(
      (list) => {
        setVersions(list);
        setError(undefined);
      },
      (reason: unknown) => setError(reason instanceof Error ? reason.message : t('error.generic')),
    );
  }, [kind, name, t]);
  useEffect(load, [load, team]);

  const onRestored = (changed: boolean) => {
    setSelected(undefined);
    setRestored(changed);
    load();
  };

  return (
    <section className="panel-section versions" aria-label={t('versions.title')}>
      <div className="panel-section__head">
        <span className="label">{t('versions.title')}</span>
        {versions && versions.length > 0 && <span className="muted versions__count">{versions.length}</span>}
      </div>
      {restored && <p className="versions__restored">{t('versions.restored')}</p>}
      {versions?.length === 0 && <p className="empty">{t('versions.empty')}</p>}
      {versions && versions.length > 0 && (
        <ul className="versions__list">
          {versions.map((version, index) => {
            const open = selected === version.id;
            return (
              <li key={version.id}>
                <button
                  type="button"
                  className={`versions__item${open ? ' versions__item--open' : ''}`}
                  aria-expanded={open}
                  onClick={() => {
                    setRestored(false);
                    setSelected(open ? undefined : version.id);
                  }}
                >
                  <span className="versions__when">{formatWhen(version.at, settings.language)}</span>
                  <span className={CHIP[version.change]}>{t(`versions.change.${version.change}` as StringKey)}</span>
                  {version.restoredFrom !== undefined && (
                    <span className="versions__from">{t('versions.restoredFrom').replace('{id}', String(version.restoredFrom))}</span>
                  )}
                  {index === 0 && <span className="versions__latest">{t('versions.latest')}</span>}
                  <span className="versions__size mono">{version.change === 'deleted' ? '' : formatBytes(version.size)}</span>
                </button>
                {open && <VersionPanel kind={kind} name={name} id={version.id} onRestored={onRestored} />}
              </li>
            );
          })}
        </ul>
      )}
      {error && <div className="error-banner">{error}</div>}
    </section>
  );
}
