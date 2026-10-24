import { useState } from 'react';
import { api } from '../../api/client.ts';
import { type Outgoing, useCommandField } from '../../hooks/useCommandField.ts';
import { useInitWorkspace } from '../../hooks/useInitWorkspace.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { CommandMenu, CommandNoteLine } from '../CommandMenu.tsx';

/** "Ask the team" over the aquarium: starts a new chat and hands it over to be shown in the chat popup. */
export function AskTeam({ onStarted }: { onStarted: (threadId: string) => void }) {
  const { t } = useSettings();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const init = useInitWorkspace(onStarted);

  const start = async ({ text, command }: Outgoing): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(undefined);
    try {
      const { thread } = await api.createThread(text, command);
      onStarted(thread.id);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('error.generic'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const field = useCommandField({ actions: { init }, onSend: start });

  return (
    <div className="ask">
      {error && <div className="error-banner">{error}</div>}
      <form
        className="hud-surface ask__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (field.value.trim() && !busy) void field.submit();
        }}
      >
        <span className="label ask__label">{t('home.ask')}</span>
        <div className="command-field">
          <CommandMenu menu={field.menu} />
          {!field.menu.open && <CommandNoteLine note={field.note} />}
          <input
            className="input ask__input"
            aria-label={t('home.ask')}
            placeholder={t('home.askPlaceholder')}
            value={field.value}
            onChange={(event) => field.change(event.target.value)}
            onKeyDown={(event) => field.menu.onKeyDown(event)}
            {...field.menu.fieldProps}
          />
        </div>
        <button type="submit" className="btn btn--primary" disabled={busy || !field.value.trim()}>
          {t('chat.send')}
        </button>
      </form>
    </div>
  );
}
