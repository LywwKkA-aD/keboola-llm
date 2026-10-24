import { useCallback, useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { knowledgeApi, type Note, type NoteSummary } from '../../api/knowledge.ts';
import { folderOf, newNotePath, noteLinkTarget } from '../../lib/notes.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import { ConfirmDialog } from '../ConfirmDialog.tsx';
import { type Draft, isDirty } from './draft.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { NoteList } from './NoteList.tsx';
import { NoteView } from './NoteView.tsx';
import { UploadButton } from './UploadButton.tsx';

const errorText = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

/** In-app address of a note; the selected note lives in the URL so it can be linked to. */
export const noteUrl = (path: string) => `/knowledge?note=${encodeURIComponent(path)}`;

const linkFrom = (path: string) => (href: string) => {
  const target = noteLinkTarget(path, href);
  return target ? noteUrl(target) : undefined;
};

/** Where a new note goes: folder and file name, typed. */
function PathField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useSettings();
  const id = useId();
  return (
    <div className="field note-editor__path">
      <label className="label" htmlFor={id}>
        {t('knowledge.path')}
      </label>
      <input
        id={id}
        className="input"
        value={value}
        placeholder="how-to/load-orders.md"
        aria-describedby={`${id}-hint`}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
      />
      <span id={`${id}-hint`} className="note-editor__hint">
        {t('knowledge.pathHint')}
      </span>
    </div>
  );
}

/** The knowledge base tab: notes on the left; the selected note, or the editor, on the right. */
export function NotesPanel({ draft, setDraft, confirm }: {
  draft: Draft | undefined;
  setDraft: (draft: Draft | undefined) => void;
  confirm: (action: () => void) => void;
}) {
  const { t } = useSettings();
  const { live } = useLive();
  const [params, setParams] = useSearchParams();
  const selected = params.get('note') ?? undefined;
  const [notes, setNotes] = useState<readonly NoteSummary[]>();
  const [note, setNote] = useState<Note>();
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Agents edit notes too: look again whenever a run starts or ends.
  const runningKey = live.running.join(',');

  const loadNotes = useCallback(() => {
    knowledgeApi.notes().then(
      (result) => setNotes(result.notes),
      (reason: unknown) => {
        setNotes((current) => current ?? []);
        setError(errorText(reason, t('error.generic')));
      },
    );
  }, [t]);
  useEffect(loadNotes, [loadNotes, runningKey]);

  useEffect(() => {
    if (!selected) {
      setNote(undefined);
      return undefined;
    }
    let current = true;
    knowledgeApi.note(selected).then(
      (loaded) => current && setNote(loaded),
      (reason: unknown) => {
        if (!current) return;
        setNote(undefined);
        setError(errorText(reason, t('error.generic')));
      },
    );
    return () => {
      current = false;
    };
  }, [selected, runningKey, version, t]);

  const show = (path: string | undefined) => {
    setError(undefined);
    setSaved(false);
    setParams(path ? { note: path } : {});
  };

  const save = async () => {
    if (!draft || draft.kind === 'memory') return;
    setBusy(true);
    setError(undefined);
    try {
      if (draft.kind === 'new') {
        const created = await knowledgeApi.createNote(newNotePath(draft.path), draft.text);
        setDraft(undefined);
        show(created.path);
      } else {
        await knowledgeApi.saveNote(draft.path, draft.text);
        setDraft(undefined);
        setVersion((value) => value + 1);
      }
      setSaved(true);
      loadNotes();
    } catch (reason) {
      setError(errorText(reason, t('error.generic')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!note) return;
    setBusy(true);
    try {
      await knowledgeApi.deleteNote(note.path);
      setDeleting(false);
      setNote(undefined);
      show(undefined);
      loadNotes();
    } catch (reason) {
      setDeleting(false);
      setError(errorText(reason, t('error.generic')));
    } finally {
      setBusy(false);
    }
  };

  const editing = draft?.kind === 'note' || draft?.kind === 'new' ? draft : undefined;

  const detail = () => {
    if (editing) {
      const newNote = editing.kind === 'new';
      return (
        <MarkdownEditor
          heading={<h2 className={`note-detail__title${newNote ? '' : ' mono'}`}>{newNote ? t('knowledge.new') : editing.path}</h2>}
          text={editing.text}
          onChange={(text) => setDraft({ ...editing, text })}
          onSave={() => void save()}
          onCancel={() => confirm(() => setError(undefined))}
          dirty={isDirty(editing)}
          busy={busy}
          error={error}
          internalLink={linkFrom(newNote ? newNotePath(editing.path) : editing.path)}
        >
          {newNote && <PathField value={editing.path} onChange={(path) => setDraft({ ...editing, path })} />}
        </MarkdownEditor>
      );
    }
    const banner = error && <div className="error-banner">{error}</div>;
    if (!selected || !note || note.path !== selected) {
      return (
        <>
          {banner}
          {!selected && <p className="empty">{t('knowledge.pick')}</p>}
        </>
      );
    }
    return (
      <>
        {banner}
        <NoteView
          path={note.path}
          modifiedAt={note.modifiedAt}
          size={note.size}
          text={note.content}
          internalLink={linkFrom(note.path)}
          actions={
            <>
              {saved && <span className="chip chip--green">{t('knowledge.saved')}</span>}
              <button type="button" className="btn btn--small" onClick={() => setDraft({ kind: 'note', path: note.path, original: note.content, text: note.content })}>
                {t('knowledge.edit')}
              </button>
              <button type="button" className="btn btn--danger btn--small" onClick={() => setDeleting(true)}>
                {t('knowledge.delete')}
              </button>
            </>
          }
        />
      </>
    );
  };

  return (
    <div className="knowledge__body">
      <aside className="knowledge__list">
        <div className="knowledge__toolbar">
          <button
            type="button"
            className="btn btn--primary btn--small"
            onClick={() => confirm(() => setDraft({ kind: 'new', path: selected && folderOf(selected) ? `${folderOf(selected)}/` : '', text: '' }))}
          >
            {t('knowledge.new')}
          </button>
          <UploadButton
            onDone={(uploaded, errors) => {
              loadNotes();
              const last = uploaded.at(-1);
              if (last && !editing) show(last.path);
              setError(errors.length > 0 ? errors.join(' ') : undefined);
            }}
          />
        </div>
        <NoteList notes={notes} selected={editing ? (editing.kind === 'note' ? editing.path : undefined) : selected} onSelect={(path) => confirm(() => show(path))} />
      </aside>
      <section className="knowledge__detail">{detail()}</section>
      {deleting && note && (
        <ConfirmDialog
          title={t('knowledge.deleteTitle')}
          message={t('knowledge.deleteText').replace('{path}', note.path)}
          confirmLabel={t('knowledge.delete')}
          cancelLabel={t('knowledge.cancel')}
          danger
          busy={busy}
          onCancel={() => setDeleting(false)}
          onConfirm={() => void remove()}
        />
      )}
    </div>
  );
}
