import { useState } from 'react';
import { useSettings } from '../../state/settings-context.tsx';
import type { Os } from './commands.ts';

/** A command to run in the user's own terminal, with a copy button. */
export function CommandBlock({ command, os }: { command: string; os: Os }) {
  const { t } = useSettings();
  // The command that was copied: when the command changes (new alias, new address), the button resets.
  const [copied, setCopied] = useState<string>();

  const copy = () => {
    // Clipboard access needs a secure context; the app runs on loopback, which counts as one.
    navigator.clipboard?.writeText(command).then(
      () => setCopied(command),
      () => setCopied(undefined),
    );
  };

  return (
    <div className="command">
      <div className="command__head">
        <span className="label">{os === 'windows' ? t('setup.runWindows') : t('setup.runTerminal')}</span>
        <button type="button" className="btn btn--ghost btn--small" onClick={copy}>
          {copied === command ? t('setup.copied') : t('setup.copy')}
        </button>
      </div>
      <pre className="command__code">
        <code>{command}</code>
      </pre>
    </div>
  );
}
