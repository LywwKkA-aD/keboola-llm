import type { ReactNode } from 'react';
import { formatDateTime, formatSize } from '../../lib/format.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { Markdown } from '../Markdown.tsx';

/** A note rendered as Markdown, under its path, when it changed, its size and the actions it allows. */
export function NoteView({ path, modifiedAt, size, text, emptyText, actions, internalLink }: {
  path: string;
  modifiedAt?: string | undefined;
  size?: number | undefined;
  text: string;
  emptyText?: string;
  actions?: ReactNode;
  internalLink?: (href: string) => string | undefined;
}) {
  const { t, settings } = useSettings();
  return (
    <article className="note-view" aria-label={path}>
      <div className="note-detail__head">
        <div className="note-detail__heading">
          <span className="note-detail__path mono">{path}</span>
          {modifiedAt && (
            <span className="note-detail__meta">
              {t('knowledge.updated')} {formatDateTime(modifiedAt, settings.language)}
              {size !== undefined && ` · ${formatSize(size, settings.language)}`}
            </span>
          )}
        </div>
        {actions && <div className="note-detail__actions">{actions}</div>}
      </div>
      {text.trim() ? (
        <Markdown className="note-view__body" text={text} {...(internalLink ? { internalLink } : {})} />
      ) : (
        <p className="empty">{emptyText ?? t('knowledge.previewEmpty')}</p>
      )}
    </article>
  );
}
