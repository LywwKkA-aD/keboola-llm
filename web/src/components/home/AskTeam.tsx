import { useState } from 'react';
import { api } from '../../api/client.ts';
import { useSettings } from '../../state/settings-context.tsx';

/** "Ask the team" over the aquarium: starts a new chat and hands it over to be shown in the chat popup. */
export function AskTeam({ onStarted }: { onStarted: (threadId: string) => void }) {
  const { t } = useSettings();
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const { thread } = await api.createThread(trimmed);
      setText('');
      onStarted(thread.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ask">
      {error && <div className="error-banner">{error}</div>}
      <form
        className="hud-surface ask__form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <span className="label ask__label">{t('home.ask')}</span>
        <input
          className="input ask__input"
          aria-label={t('home.ask')}
          placeholder={t('home.askPlaceholder')}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={busy || !text.trim()}>
          {t('chat.send')}
        </button>
      </form>
    </div>
  );
}
