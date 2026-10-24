import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router';
import remarkGfm from 'remark-gfm';

const newTabLink = (href: string | undefined, children: ReactNode) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

/**
 * Markdown as the chat shows agent replies: GitHub flavour, raw HTML never rendered, links open in a new tab.
 * internalLink maps links that stay in the app (one note to another) to an app path; they open in place,
 * or in a new tab with newTab.
 */
export function Markdown({ text, className, internalLink, newTab = false }: {
  text: string;
  className?: string;
  internalLink?: (href: string) => string | undefined;
  newTab?: boolean;
}) {
  const components = {
    a: ({ href, children }: { href?: string; children?: ReactNode }) => {
      const to = href ? internalLink?.(href) : undefined;
      if (!to) return newTabLink(href, children);
      return newTab ? newTabLink(to, children) : <Link to={to}>{children}</Link>;
    },
  };
  return (
    <div className={className ? `markdown ${className}` : 'markdown'}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
