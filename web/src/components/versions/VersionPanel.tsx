import { useEffect, useState } from 'react';
import { versionsApi } from '../../api/client.ts';
import type { DefinitionKind, VersionDetail } from '../../api/types.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { useTeam } from '../../state/team-context.tsx';
import { DiffView } from './DiffView.tsx';

const message = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

/** One version opened: its diff against the current file and "Restore this version" behind a confirmation. */
export function VersionPanel({ kind, name, id, onRestored }: {
  kind: DefinitionKind;
  name: string;
  id: number;
  onRestored: (changed: boolean) => void;
}) {
  const { t } = useSettings();
  // The team is refetched whenever agents or skills change on disk: the current file may have changed too.
  const team = useTeam();
  const [detail, setDetail] = useState<VersionDetail>();
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    versionsApi.get(kind, name, id).then(setDetail, (reason: unknown) => setError(message(reason, t('error.generic'))));
  }, [kind, name, id, team, t]);

  const restore = () => {
    setBusy(true);
    setError(undefined);
    versionsApi
      .restore(kind, name, id)
      .then(({ changed }) => onRestored(changed))
      .catch((reason: unknown) => {
        setError(message(reason, t('error.generic')));
        setBusy(false);
      });
  };

  if (!detail) return error ? <div className="versions__detail error-banner">{error}</div> : null;
  if (detail.content === null) {
    return (
      <div className="versions__detail">
        <p className="versions__note">{t('versions.deletedNote')}</p>
      </div>
    );
  }
  const same = detail.current === detail.content;

  return (
    <div className="versions__detail">
      {detail.current === null && <p className="versions__note">{t('versions.missing')}</p>}
      {same ? (
        <p className="versions__note">{t('versions.same')}</p>
      ) : (
        <>
          <p className="versions__note">{t('versions.diffHint')}</p>
          <DiffView before={detail.current ?? ''} after={detail.content} label={t('versions.version').replace('{id}', String(id))} />
          {confirming ? (
            <div className="confirm" role="group" aria-label={t('versions.restore')}>
              <p>{t('versions.confirm').replace('{id}', String(id))}</p>
              <div className="confirm__actions">
                <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={restore}>
                  {t('versions.confirmRestore')}
                </button>
                <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => setConfirming(false)}>
                  {t('versions.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button type="button" className="btn btn--small" onClick={() => setConfirming(true)}>
                {t('versions.restore')}
              </button>
            </div>
          )}
        </>
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
