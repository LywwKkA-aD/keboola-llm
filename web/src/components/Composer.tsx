import type { FormEvent, KeyboardEvent } from 'react';
import { type CommandActions, type Outgoing, useCommandField } from '../hooks/useCommandField.ts';
import { useSettings } from '../state/settings-context.tsx';
import { CommandMenu, CommandNoteLine } from './CommandMenu.tsx';

/** The chat composer; "/" at the start opens the command menu (see lib/commands.ts). */
export function Composer({ onSend, onStop, running, disabled, actions = {} }: {
  onSend: (message: Outgoing) => void;
  onStop: () => void;
  running: boolean;
  disabled: boolean;
  actions?: CommandActions;
}) {
  const { t } = useSettings();
  const field = useCommandField({ actions, onSend });

  const submit = () => {
    if (!field.value.trim() || disabled) return;
    void field.submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (field.menu.onKeyDown(event)) return;
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
      <div className="command-field">
        <CommandMenu menu={field.menu} />
        {!field.menu.open && <CommandNoteLine note={field.note} />}
        <textarea
          className="composer__input"
          aria-label={t('chat.placeholder')}
          placeholder={t('chat.placeholderCommands')}
          value={field.value}
          rows={3}
          onChange={(event) => field.change(event.target.value)}
          onKeyDown={onKeyDown}
          {...field.menu.fieldProps}
        />
      </div>
      {running ? (
        <button type="button" className="btn btn--secondary" onClick={onStop}>
          {t('chat.stop')}
        </button>
      ) : (
        <button type="submit" className="btn btn--primary" disabled={disabled || !field.value.trim()}>
          {t('chat.send')}
        </button>
      )}
    </form>
  );
}
