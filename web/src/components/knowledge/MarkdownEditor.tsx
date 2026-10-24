import { type KeyboardEvent, type ReactNode, useId } from 'react';
import { useSettings } from '../../state/settings-context.tsx';
import { Markdown } from '../Markdown.tsx';

/**
 * Markdown source next to its live preview, with Save and Cancel. Ctrl+S or Cmd+S saves.
 * Links to other notes in the preview open in a new tab, so following one never drops the draft.
 */
export function MarkdownEditor({ heading, text, onChange, onSave, onCancel, dirty, busy, error, conflict, internalLink, children }: {
  heading: ReactNode;
  text: string;
  onChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
  dirty: boolean;
  busy: boolean;
  error?: string | undefined;
  /** The file changed on the server since the draft was opened (e.g. an agent wrote it): keep the text, let the user pick. */
  conflict?: { readonly text: string; readonly onOverwrite: () => void; readonly onReload: () => void } | undefined;
  internalLink?: (href: string) => string | undefined;
  /** Extra fields above the text, e.g. the path of a new note. */
  children?: ReactNode;
}) {
  const { t } = useSettings();
  const sourceId = useId();

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!busy) onSave();
    }
  };

  return (
    <section className="note-editor" aria-label={t('knowledge.edit')}>
      <div className="note-detail__head">
        <div className="note-detail__heading">{heading}</div>
        <div className="note-detail__actions">
          {dirty && <span className="chip chip--amber">{t('knowledge.unsaved')}</span>}
          <button type="button" className="btn btn--small" onClick={onCancel}>
            {t('knowledge.cancel')}
          </button>
          <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={onSave}>
            {t('knowledge.save')}
          </button>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {conflict && (
        <div className="notice note-editor__conflict" role="alert">
          <p>{conflict.text}</p>
          <div className="note-detail__actions">
            <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={conflict.onOverwrite}>
              {t('knowledge.overwrite')}
            </button>
            <button type="button" className="btn btn--small" disabled={busy} onClick={conflict.onReload}>
              {t('knowledge.reload')}
            </button>
          </div>
        </div>
      )}
      {children}
      <div className="note-editor__panes">
        <div className="note-editor__pane">
          <label className="label" htmlFor={sourceId}>
            {t('knowledge.markdown')}
          </label>
          <textarea
            id={sourceId}
            className="textarea note-editor__source"
            value={text}
            spellCheck
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="note-editor__pane">
          <span className="label">{t('knowledge.preview')}</span>
          <div className="note-editor__preview">
            {text.trim() ? <Markdown text={text} {...(internalLink ? { internalLink } : {})} newTab /> : <p className="empty">{t('knowledge.previewEmpty')}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
