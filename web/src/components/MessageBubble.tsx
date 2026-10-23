import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSettings } from '../state/settings-context.tsx';

const components = {
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

/** User text is shown as typed; agent replies are Markdown (raw HTML is never rendered). */
export function MessageBubble({ role, text, pending = false }: { role: 'user' | 'assistant'; text: string; pending?: boolean }) {
  const { t } = useSettings();
  return (
    <div className={`message message--${role}${pending ? ' message--pending' : ''}`}>
      <span className="label message__who">{t(role === 'user' ? 'chat.you' : 'chat.team')}</span>
      {role === 'user' ? (
        <p className="message__plain">{text}</p>
      ) : (
        <div className="message__markdown">
          <Markdown remarkPlugins={[remarkGfm]} components={components}>
            {text}
          </Markdown>
        </div>
      )}
    </div>
  );
}
