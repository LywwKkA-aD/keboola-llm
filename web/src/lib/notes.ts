import type { NoteSummary } from '../api/knowledge.ts';

export interface NoteGroup {
  /** "" is the top level. */
  readonly folder: string;
  readonly notes: readonly NoteSummary[];
}

export const folderOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

const matches = (note: NoteSummary, words: readonly string[]) => {
  const haystack = `${note.title} ${note.path}`.toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
};

/** Notes that match every word of the filter, grouped by folder: the top level first, titles in order. */
export function groupNotes(notes: readonly NoteSummary[], filter: string): NoteGroup[] {
  const words = filter.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const shown = notes.filter((note) => matches(note, words));
  const folders = [...new Set(shown.map((note) => folderOf(note.path)))].toSorted((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  return folders.map((folder) => ({
    folder,
    notes: shown.filter((note) => folderOf(note.path) === folder).toSorted((a, b) => a.title.localeCompare(b.title)),
  }));
}

/** What the user typed as a new note's path, tidied: "/" separators, no leading "/" or "./", a .md extension. */
export function newNotePath(input: string): string {
  const path = input.trim().replaceAll('\\', '/').replace(/^(\.?\/)+/, '');
  if (!path || path.endsWith('/')) return path;
  return /\.md$/i.test(path) ? path.replace(/\.md$/i, '.md') : `${path}.md`;
}

const KNOWLEDGE_ROOT = '/knowledge/';

/**
 * The note a link inside a note points to: relative links resolve against the note's folder, and agents'
 * virtual paths (/knowledge/...) work too. Anything else (web links, anchors, other files) is undefined.
 */
export function noteLinkTarget(from: string, href: string): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//')) return undefined;
  const bare = href.replace(/[?#].*$/, '');
  let raw: string;
  try {
    raw = decodeURIComponent(bare);
  } catch {
    return undefined;
  }
  if (raw.startsWith('/') && !raw.startsWith(KNOWLEDGE_ROOT)) return undefined;
  const start = raw.startsWith(KNOWLEDGE_ROOT) ? [] : folderOf(from).split('/').filter(Boolean);
  const steps = (raw.startsWith(KNOWLEDGE_ROOT) ? raw.slice(KNOWLEDGE_ROOT.length) : raw).split('/');
  const resolved = steps.reduce<string[] | undefined>((segments, step) => {
    if (!segments || step === '' || step === '.') return segments;
    if (step === '..') return segments.length > 0 ? segments.slice(0, -1) : undefined;
    return [...segments, step];
  }, start);
  const path = resolved?.join('/');
  return path?.endsWith('.md') ? path : undefined;
}
