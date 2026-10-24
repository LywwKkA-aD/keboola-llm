import { noteError } from './errors.ts';

const MAX_PATH_LENGTH = 200;
const MAX_SEGMENT_LENGTH = 100;
/** Folders plus the file name. */
export const MAX_DEPTH = 6;
const UPLOAD_STEM_LENGTH = 80;

// Separators and the characters Windows refuses in names; ':' would also open an NTFS alternate data stream.
const FORBIDDEN = /[<>:"|?*\\/]/;
const FORBIDDEN_ALL = /[<>:"|?*\\/]/g;
const CONTROL = /[\u0000-\u001f\u007f]/;
const CONTROL_ALL = /[\u0000-\u001f\u007f]/g;
// Device names Windows maps to hardware whatever the extension.
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

const invalid = (reason: string) => noteError('NOTE_INVALID', `Invalid path: ${reason}`);

function checkSegment(segment: string): void {
  if (segment === '..') throw invalid('".." is not allowed');
  if (segment.startsWith('.')) throw invalid('hidden files and folders are not allowed');
  if (FORBIDDEN.test(segment)) throw invalid('use letters, digits, spaces, "-", "_" and "/" between folders');
  if (RESERVED.test(segment)) throw invalid(`"${segment}" is a reserved name`);
  if (segment.trim() !== segment || segment.endsWith('.')) throw invalid('names may not start or end with a space or end with a dot');
  if (segment.length > MAX_SEGMENT_LENGTH) throw invalid('a name is too long');
}

/** Split a relative path into checked segments: "." and empty segments drop out, everything risky throws. */
function segmentsOf(raw: unknown): string[] {
  if (typeof raw !== 'string') throw invalid('expected a string');
  const value = raw.normalize('NFC');
  if (value.length > MAX_PATH_LENGTH) throw invalid('too long');
  if (CONTROL.test(value)) throw invalid('control characters are not allowed');
  if (value.includes('\\')) throw invalid('use "/" between folders');
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) throw invalid('use a path relative to the knowledge base');
  const segments = value.split('/').filter((segment) => segment !== '' && segment !== '.');
  segments.forEach(checkSegment);
  if (segments.length > MAX_DEPTH) throw invalid('too many nested folders');
  return segments;
}

/**
 * The canonical form of a note path relative to its folder ("how-to/load-orders.md"), or a 400 error.
 * Only plain relative .md paths pass: no "..", absolute paths, drive letters, backslashes or hidden segments.
 */
export function parseNotePath(raw: unknown): string {
  if (typeof raw === 'string' && raw.endsWith('/')) throw invalid('a note path names a file, not a folder');
  const segments = segmentsOf(raw);
  const name = segments.at(-1) ?? '';
  if (!name.endsWith('.md') || name === '.md') throw invalid('notes are .md files');
  return segments.join('/');
}

/** A folder inside the knowledge base; empty means the top level. */
export function parseFolder(raw: unknown): string {
  if (raw === undefined || raw === '') return '';
  return segmentsOf(raw).join('/');
}

/** An uploaded file's name without folders or extension: the title a plain-text upload gets. */
export const uploadTitle = (fileName: string): string =>
  (fileName.split(/[\\/]/).at(-1) ?? '').replace(/\.(md|txt)$/i, '').replace(CONTROL_ALL, '').trim() || 'Note';

/** Where an uploaded .md or .txt file goes: its base name made safe and lower-case, always ending in .md. */
export function uploadPath(fileName: string, folder?: string): string {
  const base = fileName.split(/[\\/]/).at(-1) ?? '';
  const match = /^(.*)\.(md|txt)$/i.exec(base);
  if (!match) throw noteError('NOTE_INVALID', 'Only .md and .txt files can be uploaded');
  const stem =
    (match[1] ?? '')
      .normalize('NFC')
      .toLocaleLowerCase()
      .replace(CONTROL_ALL, '')
      .replace(FORBIDDEN_ALL, '-')
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, UPLOAD_STEM_LENGTH) || 'note';
  const safeStem = RESERVED.test(stem) ? `note-${stem}` : stem;
  const prefix = parseFolder(folder);
  return parseNotePath(prefix ? `${prefix}/${safeStem}.md` : `${safeStem}.md`);
}
