import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '../api/knowledge.ts';
import { formatDateTime, formatSize } from './format.ts';
import { folderOf, groupNotes, newNotePath, noteLinkTarget } from './notes.ts';

const note = (path: string, title: string): NoteSummary => ({ path, title, size: 10, modifiedAt: '2026-10-24T10:00:00Z' });

const NOTES = [
  note('how-to/deploy.md', 'Deploy to production'),
  note('glossary.md', 'Glossary'),
  note('data-model/sales.md', 'Sales tables'),
  note('README.md', 'Knowledge base'),
  note('data-model/customers.md', 'Customers'),
];

describe('groupNotes', () => {
  it('groups notes by folder, the top level first, titles sorted', () => {
    expect(groupNotes(NOTES, '').map((group) => [group.folder, group.notes.map((entry) => entry.title)])).toEqual([
      ['', ['Glossary', 'Knowledge base']],
      ['data-model', ['Customers', 'Sales tables']],
      ['how-to', ['Deploy to production']],
    ]);
  });

  it('filters by every word, in titles and paths, ignoring case', () => {
    expect(groupNotes(NOTES, 'SALES').flatMap((group) => group.notes.map((entry) => entry.path))).toEqual(['data-model/sales.md']);
    expect(groupNotes(NOTES, 'data cust').flatMap((group) => group.notes.map((entry) => entry.path))).toEqual(['data-model/customers.md']);
    expect(groupNotes(NOTES, 'how-to')).toHaveLength(1);
    expect(groupNotes(NOTES, 'nothing like this')).toEqual([]);
  });
});

describe('newNotePath', () => {
  it('tidies what the user typed into a .md path', () => {
    expect(newNotePath('  how-to/load orders ')).toBe('how-to/load orders.md');
    expect(newNotePath('/glossary.md')).toBe('glossary.md');
    expect(newNotePath('./decisions\\2026-10-24-naming.MD')).toBe('decisions/2026-10-24-naming.md');
    expect(newNotePath('how-to/')).toBe('how-to/');
    expect(newNotePath('')).toBe('');
  });
});

describe('noteLinkTarget', () => {
  it('resolves relative links between notes', () => {
    expect(noteLinkTarget('how-to/deploy.md', 'checklist.md')).toBe('how-to/checklist.md');
    expect(noteLinkTarget('how-to/deploy.md', '../glossary.md#orders')).toBe('glossary.md');
    expect(noteLinkTarget('how-to/deploy.md', './sub/step%201.md')).toBe('how-to/sub/step 1.md');
    expect(noteLinkTarget('README.md', '/knowledge/data-model/sales.md')).toBe('data-model/sales.md');
  });

  it('leaves other links alone', () => {
    expect(noteLinkTarget('how-to/deploy.md', 'https://keboola.com/a.md')).toBeUndefined();
    expect(noteLinkTarget('how-to/deploy.md', 'mailto:x@example.com')).toBeUndefined();
    expect(noteLinkTarget('how-to/deploy.md', '#section')).toBeUndefined();
    expect(noteLinkTarget('how-to/deploy.md', '/skills/x.md')).toBeUndefined();
    expect(noteLinkTarget('how-to/deploy.md', '//host/a.md')).toBeUndefined();
    expect(noteLinkTarget('how-to/deploy.md', '../../outside.md')).toBeUndefined();
    expect(noteLinkTarget('how-to/deploy.md', 'diagram.png')).toBeUndefined();
    expect(noteLinkTarget('how-to/deploy.md', '%E0%A4%A.md')).toBeUndefined();
  });
});

describe('formatting', () => {
  it('names the folder of a path', () => {
    expect(folderOf('how-to/deploy/prod.md')).toBe('how-to/deploy');
    expect(folderOf('glossary.md')).toBe('');
  });

  it('formats sizes and times for the reader', () => {
    expect(formatSize(512, 'en')).toBe('0.5 kB');
    expect(formatSize(20, 'en')).toBe('0.1 kB');
    expect(formatSize(0, 'en')).toBe('0 kB');
    expect(formatSize(1536, 'en')).toBe('1.5 kB');
    expect(formatDateTime('2026-10-24T10:00:00Z', 'en')).toMatch(/2026/);
  });
});
