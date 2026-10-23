import { type FormEvent, type KeyboardEvent, useState } from 'react';
import { useSettings } from '../state/settings-context.tsx';

export function Composer({ onSend, onStop, running, disabled }: {
  onSend: (text: string) => void;
  onStop: () => void;
  running: boolean;
  disabled: boolean;
}) {
  const { t } = useSettings();
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  return (
    <form className="composer" onSubmit={onSubmit}>
      <textarea
        className="composer__input"
        aria-label={t('chat.placeholder')}
        placeholder={t('chat.placeholder')}
        value={text}
        rows={3}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {running ? (
        <button type="button" className="btn btn--secondary" onClick={onStop}>
          {t('chat.stop')}
        </button>
      ) : (
        <button type="submit" className="btn btn--primary" disabled={disabled || !text.trim()}>
          {t('chat.send')}
        </button>
      )}
    </form>
  );
}
