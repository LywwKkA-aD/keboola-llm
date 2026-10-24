import { randomUUID } from 'node:crypto';
import type { Dirent, Stats } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { noteError } from './errors.ts';
import { titleOf } from './markdown.ts';
import { MAX_DEPTH, parseNotePath } from './note-path.ts';

/** Largest note the API writes, in bytes of UTF-8. */
export const MAX_NOTE_BYTES = 256 * 1024;
/** The lead reads shared memory into every prompt: it stays much smaller than a note. */
export const MAX_MEMORY_BYTES = 64 * 1024;
/** Notes agents wrote may be bigger than what the API accepts; reading stops somewhere sane. */
const MAX_READ_BYTES = 2 * 1024 * 1024;
/** Enough of a note to find its title without reading all of it. */
const TITLE_SCAN_BYTES = 16 * 1024;

export interface NoteSummary {
  /** Relative to the store's folder, "/"-separated: "how-to/load-orders.md". */
  readonly path: string;
  readonly title: string;
  readonly size: number;
  readonly modifiedAt: string;
}

export interface Note extends NoteSummary {
  readonly content: string;
}

export interface NoteStore {
  list(): Promise<readonly NoteSummary[]>;
  read(path: string): Promise<Note>;
  /** Create or replace a note; with create, an existing note is a 409 instead. */
  write(path: string, content: string, options?: { readonly create?: boolean }): Promise<NoteSummary>;
  remove(path: string): Promise<void>;
}

const notFound = () => noteError('NOTE_NOT_FOUND', 'Note not found');
const linked = () => noteError('NOTE_INVALID', 'Invalid path: links are not allowed in the knowledge base');

const fileTitle = (path: string) => basename(path, '.md');

async function statOrNothing(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function readHead(file: string, bytes: number): Promise<string> {
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

const summaryOf = (path: string, info: Stats, content: string): NoteSummary => ({
  path,
  title: titleOf(content, fileTitle(path)),
  size: info.size,
  modifiedAt: info.mtime.toISOString(),
});

const isAddressable = (path: string) => {
  try {
    return parseNotePath(path) === path;
  } catch {
    return false;
  }
};

/**
 * Markdown notes in one folder, addressed by validated relative paths. Nothing below the folder may be a
 * link, so no path can reach outside it; the folder itself may sit behind one (e.g. /tmp on macOS).
 */
export function createNoteStore(rootDir: string, { maxBytes = MAX_NOTE_BYTES }: { maxBytes?: number } = {}): NoteStore {
  const isBelowRoot = (dir: string) => {
    const inside = relative(rootDir, dir);
    return inside !== '' && !inside.startsWith('..') && !isAbsolute(inside);
  };

  /** Absolute file of a valid path, after checking every existing part of it is a real folder or file. */
  async function locate(raw: string): Promise<{ path: string; file: string; info: Stats | undefined }> {
    const path = parseNotePath(raw);
    const segments = path.split('/');
    const file = join(rootDir, ...segments);
    if (!isBelowRoot(file)) throw noteError('NOTE_INVALID', 'Invalid path: outside the knowledge base');
    let current = rootDir;
    for (const [index, segment] of segments.entries()) {
      current = join(current, segment);
      const info = await statOrNothing(current);
      if (!info) return { path, file, info: undefined };
      if (info.isSymbolicLink()) throw linked();
      const last = index === segments.length - 1;
      if (last) return { path, file, info };
      if (!info.isDirectory()) throw noteError('NOTE_INVALID', `Invalid path: "${segments.slice(0, index + 1).join('/')}" is a file, not a folder`);
    }
    return { path, file, info: undefined };
  }

  async function walk(dir: string, prefix: string, depth: number): Promise<NoteSummary[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const nested = await Promise.all(
      entries
        .filter((entry) => !entry.name.startsWith('.'))
        .map(async (entry): Promise<NoteSummary[]> => {
          const path = prefix ? `${prefix}/${entry.name}` : entry.name;
          const full = join(dir, entry.name);
          // Dirent types come from lstat: links are neither folders nor files here, so they are skipped.
          if (entry.isDirectory()) return depth < MAX_DEPTH - 1 ? walk(full, path, depth + 1) : [];
          if (!entry.isFile() || !isAddressable(path)) return [];
          try {
            return [summaryOf(path, await lstat(full), await readHead(full, TITLE_SCAN_BYTES))];
          } catch {
            return [];
          }
        }),
    );
    return nested.flat();
  }

  /** Remove the folders a deleted note leaves empty, up to (not including) the root. */
  async function pruneEmptyFolders(from: string): Promise<void> {
    for (let dir = from; isBelowRoot(dir); dir = dirname(dir)) {
      try {
        await rmdir(dir);
      } catch {
        return;
      }
    }
  }

  async function prepareFolder(path: string, file: string): Promise<void> {
    try {
      await mkdir(dirname(file), { recursive: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST' || code === 'ENOTDIR') throw noteError('NOTE_INVALID', `Invalid path: a file stands where a folder of "${path}" should be`);
      throw error;
    }
  }

  return {
    async list() {
      const notes = await walk(rootDir, '', 0);
      return notes.toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    },

    async read(raw) {
      const { path, file, info } = await locate(raw);
      if (!info?.isFile()) throw notFound();
      if (info.size > MAX_READ_BYTES) throw noteError('NOTE_TOO_LARGE', 'The note is too large to show');
      const content = await readFile(file, 'utf8');
      return { ...summaryOf(path, info, content), content };
    },

    async write(raw, content, { create = false } = {}) {
      if (Buffer.byteLength(content, 'utf8') > maxBytes) {
        throw noteError('NOTE_TOO_LARGE', `The note is larger than ${Math.round(maxBytes / 1024)} KB`);
      }
      const { path, file, info } = await locate(raw);
      if (info && !info.isFile()) throw noteError('NOTE_INVALID', `Invalid path: "${path}" is a folder`);
      if (info && create) throw noteError('NOTE_EXISTS', `A note named "${path}" already exists`);
      await prepareFolder(path, file);
      if (create) {
        try {
          await writeFile(file, content, { flag: 'wx' });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw noteError('NOTE_EXISTS', `A note named "${path}" already exists`);
          throw error;
        }
      } else {
        // Write aside, then swap in: an agent reading the note never sees half of it.
        const temp = join(dirname(file), `.${basename(file)}.${randomUUID()}.tmp`);
        try {
          await writeFile(temp, content, { flag: 'wx' });
          await rename(temp, file);
        } catch (error) {
          await unlink(temp).catch(() => {});
          throw error;
        }
      }
      return summaryOf(path, await lstat(file), content);
    },

    async remove(raw) {
      const { file, info } = await locate(raw);
      if (!info?.isFile()) throw notFound();
      try {
        await unlink(file);
      } catch (error) {
        throw (error as NodeJS.ErrnoException).code === 'ENOENT' ? notFound() : error;
      }
      await pruneEmptyFolders(dirname(file));
    },
  };
}
