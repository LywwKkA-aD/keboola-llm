import { useRef, useState } from 'react';
import { knowledgeApi, MAX_NOTE_BYTES, type NoteSummary } from '../../api/knowledge.ts';
import { useSettings } from '../../state/settings-context.tsx';

const errorText = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

/** Upload .md and .txt files as notes; they land at the top level, where knowledge-keeper can file them. */
export function UploadButton({ onDone }: { onDone: (uploaded: readonly NoteSummary[], errors: readonly string[]) => void }) {
  const { t } = useSettings();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const uploadOne = async (file: File): Promise<NoteSummary | string> => {
    if (!/\.(md|txt)$/i.test(file.name)) return t('knowledge.badType').replace('{name}', file.name);
    if (file.size > MAX_NOTE_BYTES) return t('knowledge.tooLarge').replace('{name}', file.name);
    try {
      return await knowledgeApi.upload(file.name, await file.text());
    } catch (reason) {
      return `${file.name}: ${errorText(reason, t('error.generic'))}`;
    }
  };

  const upload = async (files: readonly File[]) => {
    setBusy(true);
    // One after another: each may answer 409 for a name the previous one just took.
    const results: (NoteSummary | string)[] = [];
    for (const file of files) results.push(await uploadOne(file));
    setBusy(false);
    onDone(
      results.filter((result): result is NoteSummary => typeof result !== 'string'),
      results.filter((result): result is string => typeof result === 'string'),
    );
  };

  return (
    <>
      <button type="button" className="btn btn--small" disabled={busy} title={t('knowledge.uploadHint')} onClick={() => input.current?.click()}>
        {t('knowledge.upload')}
      </button>
      <input
        ref={input}
        type="file"
        accept=".md,.txt,text/markdown,text/plain"
        multiple
        hidden
        aria-label={t('knowledge.upload')}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length > 0) void upload(files);
        }}
      />
    </>
  );
}
