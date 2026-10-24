import type { ChatCommand } from '../api/types.ts';
import { commandLabel } from '../lib/commands.ts';
import { useSettings } from '../state/settings-context.tsx';
import { Markdown } from './Markdown.tsx';

/** User text is shown as typed, with the command it was sent with; agent replies are Markdown (never raw HTML). */
export function MessageBubble({ role, text, command, pending = false }: { role: 'user' | 'assistant'; text: string; command?: ChatCommand; pending?: boolean }) {
  const { t } = useSettings();
  return (
    <div className={`message message--${role}${pending ? ' message--pending' : ''}`}>
      <span className="label message__who">{t(role === 'user' ? 'chat.you' : 'chat.team')}</span>
      {command && <span className="message__command mono">{commandLabel(command)}</span>}
      {role === 'user' ? text && <p className="message__plain">{text}</p> : <Markdown className="message__markdown" text={text} />}
    </div>
  );
}
