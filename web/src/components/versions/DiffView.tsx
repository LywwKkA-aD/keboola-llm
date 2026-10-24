import { useMemo } from 'react';
import { collapseUnchanged, diffLines, diffStats } from '../../lib/line-diff.ts';
import { useSettings } from '../../state/settings-context.tsx';

const SIGN = { same: ' ', add: '+', del: '-' } as const;

/** Line diff from one text to another, with long unchanged stretches folded. */
export function DiffView({ before, after, label }: { before: string; after: string; label: string }) {
  const { t } = useSettings();
  const lines = useMemo(() => diffLines(before, after), [before, after]);
  const rows = useMemo(() => collapseUnchanged(lines), [lines]);
  const { added, removed } = diffStats(lines);

  return (
    <div className="diff">
      <div className="diff__stats mono">
        <span className="diff__added">+{added}</span> <span className="diff__removed">-{removed}</span>
      </div>
      <ol className="diff__lines mono" aria-label={label}>
        {rows.map((row, index) =>
          row.op === 'skip' ? (
            <li key={index} className="diff__skip">
              {t('versions.unchanged').replace('{count}', String(row.count))}
            </li>
          ) : (
            <li key={index} className={`diff__line diff__line--${row.op}`}>
              <span className="diff__sign">{SIGN[row.op]}</span>
              <span className="diff__text">{row.text}</span>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
