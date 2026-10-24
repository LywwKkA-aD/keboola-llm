import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client.ts';
import { knowledgeApi, type MemoryFile, type Note, type NoteSummary } from '../../api/knowledge.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import { type Draft, isDirty } from './draft.ts';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { NoteView } from './NoteView.tsx';

const errorText = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

/** The memory tab: the shared AGENTS.md (editable) and project-scout's project profiles (read-only). */
export function MemoryPanel({ draft, setDraft, confirm }: {
  draft: Draft | undefined;
  setDraft: (draft: Draft | undefined) => void;
  confirm: (action: () => void) => void;
}) {
  const { t } = useSettings();
  const { live } = useLive();
  const [memory, setMemory] = useState<MemoryFile>();
  const [profiles, setProfiles] = useState<readonly NoteSummary[]>();
  /** A profile's file name; undefined is the shared memory. */
  const [selected, setSelected] = useState<string>();
  const [profile, setProfile] = useState<Note>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);
  // The lead and project-scout write here during runs: look again whenever one starts or ends.
  const runningKey = live.running.join(',');

  useEffect(() => {
    knowledgeApi.memory().then(setMemory, (reason: unknown) => setError(errorText(reason, t('error.generic'))));
    knowledgeApi.profiles().then(
      (result) => setProfiles(result.profiles),
      () => setProfiles([]),
    );
  }, [runningKey, t]);

  useEffect(() => {
    if (!selected) return undefined;
    let current = true;
    knowledgeApi.profile(selected).then(
      (loaded) => current && setProfile(loaded),
      (reason: unknown) => current && setError(errorText(reason, t('error.generic'))),
    );
    return () => {
      current = false;
    };
  }, [selected, runningKey, t]);

  const editing = draft?.kind === 'memory' ? draft : undefined;

  const select = (file: string | undefined) =>
    confirm(() => {
      setError(undefined);
      setSaved(false);
      setSelected(file);
    });

  /** overwrite: save even though the lead or project-scout changed the memory since the draft was opened. */
  const save = async ({ overwrite = false } = {}) => {
    if (!editing) return;
    setBusy(true);
    setError(undefined);
    try {
      setMemory(await knowledgeApi.saveMemory(editing.text, overwrite ? undefined : editing.baseModifiedAt));
      setDraft(undefined);
      setConflict(false);
      setSaved(true);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) setConflict(true);
      else setError(errorText(reason, t('error.generic')));
    } finally {
      setBusy(false);
    }
  };

  const reloadMemory = () => {
    setConflict(false);
    setDraft(undefined);
    knowledgeApi.memory().then(setMemory, (reason: unknown) => setError(errorText(reason, t('error.generic'))));
  };

  const detail = () => {
    if (editing) {
      return (
        <MarkdownEditor
          heading={<h2 className="note-detail__title">{t('memory.shared')}</h2>}
          text={editing.text}
          onChange={(text) => setDraft({ ...editing, text })}
          onSave={() => void save()}
          onCancel={() =>
            confirm(() => {
              setError(undefined);
              setConflict(false);
            })
          }
          dirty={isDirty(editing)}
          busy={busy}
          error={error}
          conflict={conflict ? { text: t('memory.conflict'), onOverwrite: () => void save({ overwrite: true }), onReload: reloadMemory } : undefined}
        >
          <p className="note-editor__hint">{t('memory.sharedHint')}</p>
        </MarkdownEditor>
      );
    }
    const banner = error && <div className="error-banner">{error}</div>;
    if (selected) {
      return (
        <>
          {banner}
          {profile?.path === selected && (
            <NoteView
              path={`projects/${profile.path}`}
              modifiedAt={profile.modifiedAt}
              size={profile.size}
              text={profile.content}
              actions={<span className="chip">{t('memory.readOnly')}</span>}
            />
          )}
        </>
      );
    }
    return (
      <>
        {banner}
        <p className="note-editor__hint">{t('memory.sharedHint')}</p>
        {memory && (
          <NoteView
            path="AGENTS.md"
            modifiedAt={memory.modifiedAt}
            text={memory.content}
            emptyText={t('memory.empty')}
            actions={
              <>
                {saved && <span className="chip chip--green">{t('knowledge.saved')}</span>}
                <button type="button" className="btn btn--small" onClick={() => setDraft({ kind: 'memory', original: memory.content, text: memory.content, ...(memory.modifiedAt ? { baseModifiedAt: memory.modifiedAt } : {}) })}>
                  {t('knowledge.edit')}
                </button>
              </>
            }
          />
        )}
      </>
    );
  };

  const item = (file: string | undefined, title: string, label: string) => (
    <li key={file ?? ''}>
      <button
        type="button"
        className={`note-item${selected === file ? ' note-item--selected' : ''}`}
        aria-current={selected === file ? 'true' : undefined}
        onClick={() => select(file)}
      >
        <span className="note-item__title">{title}</span>
        <span className="note-item__file mono">{label}</span>
      </button>
    </li>
  );

  return (
    <div className="knowledge__body">
      <aside className="knowledge__list">
        <ul className="note-list">{item(undefined, t('memory.shared'), 'AGENTS.md')}</ul>
        <div className="note-group">
          <span className="label note-group__name">{t('memory.profiles')}</span>
          <p className="note-group__hint">{t('memory.profilesHint')}</p>
          {profiles === undefined && <p className="empty">…</p>}
          {profiles?.length === 0 && <p className="empty">{t('memory.noProfiles')}</p>}
          {profiles && profiles.length > 0 && <ul className="note-list">{profiles.map((entry) => item(entry.path, entry.title, entry.path))}</ul>}
        </div>
      </aside>
      <section className="knowledge__detail">{detail()}</section>
    </div>
  );
}
