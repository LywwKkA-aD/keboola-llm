import { useSettings } from '../state/settings-context.tsx';
import { Markdown } from './Markdown.tsx';

/** User text is shown as typed; agent replies are Markdown (raw HTML is never rendered). */
export function MessageBubble({ role, text, pending = false }: { role: 'user' | 'assistant'; text: string; pending?: boolean }) {
  const { t } = useSettings();
  return (
    <div className={`message message--${role}${pending ? ' message--pending' : ''}`}>
      <span className="label message__who">{t(role === 'user' ? 'chat.you' : 'chat.team')}</span>
      {role === 'user' ? <p className="message__plain">{text}</p> : <Markdown className="message__markdown" text={text} />}
    </div>
  );
}
