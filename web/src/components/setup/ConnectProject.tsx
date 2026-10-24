import { useId, useState } from 'react';
import { useSettings } from '../../state/settings-context.tsx';
import { CommandBlock } from './CommandBlock.tsx';
import { browserLoginCommand, connectCommand, isAlias, type Os, stackUrl } from './commands.ts';

const DEFAULT_STACK = 'https://connection.keboola.com';

/**
 * Build the kbagent command that registers a Keboola project. kbagent asks for the Storage API token
 * itself, in the user's terminal: this app never asks for a Keboola token or sees one.
 */
export function ConnectProject({ os }: { os: Os }) {
  const { t } = useSettings();
  const aliasId = useId();
  const urlId = useId();
  const [alias, setAlias] = useState('main');
  const [address, setAddress] = useState(DEFAULT_STACK);
  const url = stackUrl(address);
  const validAlias = isAlias(alias);

  return (
    <div className="setup-connect">
      <div className="field">
        <label className="label" htmlFor={urlId}>
          {t('setup.connect.url')}
        </label>
        <input id={urlId} className="input mono" inputMode="url" spellCheck={false} value={address} onChange={(event) => setAddress(event.target.value)} />
        {!url && <span className="field__error">{t('setup.connect.urlInvalid')}</span>}
      </div>
      <div className="field">
        <label className="label" htmlFor={aliasId}>
          {t('setup.connect.alias')}
        </label>
        <input id={aliasId} className="input mono" spellCheck={false} value={alias} onChange={(event) => setAlias(event.target.value)} />
        {!validAlias && <span className="field__error">{t('setup.connect.invalid')}</span>}
      </div>
      {url && validAlias && <CommandBlock command={connectCommand(alias, url)} os={os} />}
      {url && (
        <details className="setup-connect__alt">
          <summary>{t('setup.connect.browser')}</summary>
          <CommandBlock command={browserLoginCommand(url)} os={os} />
        </details>
      )}
    </div>
  );
}
