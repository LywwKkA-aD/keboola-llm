import { type FormEvent, useId, useState } from 'react';
import { setupApi } from '../../api/client.ts';
import type { OmniRouteState } from '../../api/setup-types.ts';
import { useSettings } from '../../state/settings-context.tsx';

/** What the server accepts: printable characters without spaces or quotes (they would break .env). */
const isKey = (key: string) => /^[\x21-\x7E]+$/.test(key) && !/['"`\\]/.test(key);

/** OmniRoute serves its dashboard at the root of the same address as the API. */
function dashboardUrl(baseUrl: string): string | undefined {
  try {
    return new URL('/', baseUrl).href;
  } catch {
    return undefined;
  }
}

/**
 * Write-only key field: the key goes to the server once, in a POST body, and is never read back. The
 * field is masked and cleared after saving; the form only learns whether a key is set.
 */
export function OmniRouteKeyForm({ omniroute, onSaved }: { omniroute: OmniRouteState; onSaved: () => void }) {
  const { t } = useSettings();
  const keyId = useId();
  const addressId = useId();
  const [key, setKey] = useState('');
  // Undefined until the user asks to change the address.
  const [address, setAddress] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const dashboard = dashboardUrl(omniroute.baseUrl);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const apiKey = key.trim();
    if (!isKey(apiKey)) {
      setError(t('setup.key.invalid'));
      return;
    }
    const baseUrl = address?.trim();
    setBusy(true);
    setError(undefined);
    setupApi
      .saveOmniRoute({ apiKey, ...(baseUrl && baseUrl !== omniroute.baseUrl ? { baseUrl } : {}) })
      .then(
        () => {
          setKey('');
          setAddress(undefined);
          onSaved();
        },
        (reason: unknown) => setError(reason instanceof Error ? reason.message : t('error.generic')),
      )
      .finally(() => setBusy(false));
  };

  return (
    <form className="setup-key" onSubmit={save} autoComplete="off" noValidate>
      <div className="field">
        <label className="label" htmlFor={keyId}>
          {t('setup.key.label')}
        </label>
        <input
          id={keyId}
          className="input mono"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('setup.key.placeholder')}
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
      </div>
      {address === undefined ? (
        <button type="button" className="btn setup-link" onClick={() => setAddress(omniroute.baseUrl)}>
          {t('setup.key.changeAddress')}
        </button>
      ) : (
        <div className="field">
          <label className="label" htmlFor={addressId}>
            {t('setup.key.address')}
          </label>
          <input
            id={addressId}
            className="input mono"
            inputMode="url"
            spellCheck={false}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </div>
      )}
      <div className="setup-key__actions">
        <button type="submit" className="btn btn--primary btn--small" disabled={busy || !key.trim()}>
          {t('setup.key.save')}
        </button>
        {dashboard && (
          <a href={dashboard} target="_blank" rel="noreferrer">
            {t('setup.key.dashboard')}
          </a>
        )}
      </div>
      <p className="setup-key__note">{omniroute.apiKeySet ? t('setup.key.set') : t('setup.key.notSet')}</p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
