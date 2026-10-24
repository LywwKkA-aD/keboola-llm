import { describe, expect, it } from 'vitest';
import { collapseUnchanged, diffLines, diffStats, splitLines } from './line-diff.ts';

const ops = (before: string, after: string) => diffLines(before, after).map((line) => `${{ same: ' ', add: '+', del: '-' }[line.op]}${line.text}`);

describe('splitLines', () => {
  it('splits on LF and CRLF and ignores the final newline', () => {
    expect(splitLines('a\r\nb\nc\n')).toEqual(['a', 'b', 'c']);
    expect(splitLines('')).toEqual([]);
    expect(splitLines('\n')).toEqual(['']);
  });
});

describe('diffLines', () => {
  it('keeps identical text unchanged, whatever the line endings', () => {
    expect(ops('a\nb', 'a\r\nb\r\n')).toEqual([' a', ' b']);
  });

  it('adds everything to an empty file and removes everything from one', () => {
    expect(ops('', 'x\ny')).toEqual(['+x', '+y']);
    expect(ops('x\ny', '')).toEqual(['-x', '-y']);
  });

  it('finds the longest common subsequence of lines', () => {
    expect(ops('a\nb\nc\nd', 'a\nc\nd\ne')).toEqual([' a', '-b', ' c', ' d', '+e']);
    expect(ops('name: x\nenabled: true\nbody', 'name: x\nenabled: false\nbody')).toEqual([
      ' name: x',
      '-enabled: true',
      '+enabled: false',
      ' body',
    ]);
  });

  it('numbers lines on both sides', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
      { op: 'same', text: 'a', oldNo: 1, newNo: 1 },
      { op: 'del', text: 'b', oldNo: 2 },
      { op: 'add', text: 'x', newNo: 2 },
      { op: 'same', text: 'c', oldNo: 3, newNo: 3 },
    ]);
  });

  it('stays correct on inputs too big for the table, replacing the changed middle as a block', () => {
    const before = Array.from({ length: 3000 }, (_, i) => `line ${i}`).join('\n');
    const after = Array.from({ length: 3000 }, (_, i) => (i % 2 ? `line ${i}` : `edited ${i}`)).join('\n');
    const lines = diffLines(before, after);

    expect(lines.filter((line) => line.op !== 'add').map((line) => line.text)).toEqual(splitLines(before));
    expect(lines.filter((line) => line.op !== 'del').map((line) => line.text)).toEqual(splitLines(after));
    expect(lines[0]).toEqual({ op: 'del', text: 'line 0', oldNo: 1 });
  });
});

describe('diffStats', () => {
  it('counts added and removed lines', () => {
    expect(diffStats(diffLines('a\nb\nc', 'a\nx\ny'))).toEqual({ added: 2, removed: 2 });
    expect(diffStats(diffLines('a', 'a'))).toEqual({ added: 0, removed: 0 });
  });
});

describe('collapseUnchanged', () => {
  const numbered = (count: number) => Array.from({ length: count }, (_, i) => `l${i + 1}`);

  it('keeps context around changes and folds long unchanged runs', () => {
    const before = numbered(20).join('\n');
    const after = numbered(20)
      .map((line) => (line === 'l10' ? 'changed' : line))
      .join('\n');
    const rows = collapseUnchanged(diffLines(before, after), 2);

    expect(rows.map((row) => (row.op === 'skip' ? `…${row.count}` : row.text))).toEqual([
      '…7',
      'l8',
      'l9',
      'l10',
      'changed',
      'l11',
      'l12',
      '…8',
    ]);
  });

  it('does not fold a run that is barely longer than the context', () => {
    const rows = collapseUnchanged(diffLines('a\nb\nc\nd', 'x\nb\nc\nd'), 2);
    expect(rows.every((row) => row.op !== 'skip')).toBe(true);
  });

  it('folds nothing when nothing changed', () => {
    expect(collapseUnchanged(diffLines('a\nb', 'a\nb'), 1)).toEqual([
      { op: 'same', text: 'a', oldNo: 1, newNo: 1 },
      { op: 'same', text: 'b', oldNo: 2, newNo: 2 },
    ]);
  });
});
