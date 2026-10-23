import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import type { SystemStatus } from '../../api/types.ts';
import type { StringKey } from '../../i18n/strings.ts';
import { useSettings } from '../../state/settings-context.tsx';

const ROWS: readonly [keyof SystemStatus, StringKey][] = [
  ['app', 'system.app'],
  ['node', 'system.node'],
  ['omniroute', 'system.omniroute'],
  ['model', 'system.model'],
  ['kbagent', 'system.kbagent'],
];

/** The same checks as `npm run doctor`, refreshable. */
export function SystemChecks() {
  const { t } = useSettings();
  const [status, setStatus] = useState<SystemStatus>();
  const [error, setError] = useState<string>();

  const load = useCallback(() => {
    setError(undefined);
    api
      .system()
      .then(setStatus)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="checks">
      {error && <div className="error-banner">{error}</div>}
      <ul className="checks__list">
        {ROWS.map(([key, label]) => {
          const check = status?.[key];
          return (
            <li key={key} className="checks__row">
              <span className={`dot${check ? (check.ok ? ' dot--green' : ' dot--red') : ''}`} />
              <span className="checks__name">{t(label)}</span>
              <span className="checks__detail mono">{check?.detail ?? '…'}</span>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn btn--small" onClick={load}>
        {t('settings.refresh')}
      </button>
    </div>
  );
}
