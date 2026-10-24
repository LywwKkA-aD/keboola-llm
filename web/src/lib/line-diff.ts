export type DiffLine =
  | { readonly op: 'same'; readonly text: string; readonly oldNo: number; readonly newNo: number }
  | { readonly op: 'del'; readonly text: string; readonly oldNo: number }
  | { readonly op: 'add'; readonly text: string; readonly newNo: number };

/** A run of unchanged lines folded away by collapseUnchanged. */
export interface SkipRow {
  readonly op: 'skip';
  readonly count: number;
}

export type DiffRow = DiffLine | SkipRow;

/** Above this many table cells the changed middle is shown as one removed block and one added block. */
const MAX_CELLS = 4_000_000;

/** Lines of a text file: LF or CRLF, without the empty line after a final newline. */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split(/\r?\n/);
  return lines.at(-1) === '' ? lines.slice(0, -1) : lines;
}

type Op = 'same' | 'del' | 'add';

/** Edit script of a and b by longest common subsequence; removals come before additions in a changed block. */
function lcsOps(a: readonly string[], b: readonly string[]): Op[] {
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_CELLS) return [...Array<Op>(n).fill('del'), ...Array<Op>(m).fill('add')];
  // table[i * (m + 1) + j]: length of the LCS of a[i..] and b[j..].
  const table = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => table[i * (m + 1) + j] ?? 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * (m + 1) + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push('same');
      i += 1;
      j += 1;
    } else if (j >= m || (i < n && at(i + 1, j) >= at(i, j + 1))) {
      ops.push('del');
      i += 1;
    } else {
      ops.push('add');
      j += 1;
    }
  }
  return ops;
}

/** Line diff from before to after, with 1-based line numbers on each side. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix += 1;

  const middle = lcsOps(a.slice(prefix, a.length - suffix), b.slice(prefix, b.length - suffix));
  const ops: Op[] = [...Array<Op>(prefix).fill('same'), ...middle, ...Array<Op>(suffix).fill('same')];

  let oldNo = 0;
  let newNo = 0;
  return ops.map((op): DiffLine => {
    if (op === 'del') {
      oldNo += 1;
      return { op, text: a[oldNo - 1] ?? '', oldNo };
    }
    if (op === 'add') {
      newNo += 1;
      return { op, text: b[newNo - 1] ?? '', newNo };
    }
    oldNo += 1;
    newNo += 1;
    return { op, text: a[oldNo - 1] ?? '', oldNo, newNo };
  });
}

export function diffStats(lines: readonly DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((line) => line.op === 'add').length,
    removed: lines.filter((line) => line.op === 'del').length,
  };
}

/** Keep `context` unchanged lines around each change and fold longer unchanged runs into a skip row. */
export function collapseUnchanged(lines: readonly DiffLine[], context = 3): DiffRow[] {
  if (lines.every((line) => line.op === 'same')) return [...lines];
  // Split into alternating runs of unchanged and changed lines (start indexes, then slices).
  const starts = lines.flatMap((line, index) =>
    index === 0 || (lines[index - 1]?.op === 'same') !== (line.op === 'same') ? [index] : [],
  );
  const runs = starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length));

  return runs.flatMap((run, index): DiffRow[] => {
    if (run[0]?.op !== 'same') return run;
    const keepBefore = index === 0 ? 0 : context;
    const keepAfter = index === runs.length - 1 ? 0 : context;
    const hidden = run.length - keepBefore - keepAfter;
    if (hidden < 2) return run;
    return [...run.slice(0, keepBefore), { op: 'skip', count: hidden }, ...run.slice(run.length - keepAfter)];
  });
}
