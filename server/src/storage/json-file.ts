/**
 * Files the app keeps its state in (DATA_DIR/*.json and the definitions it edits), written so that a crash, a power
 * cut or a Windows antivirus/OneDrive/indexer holding the file never costs data: a write goes to a temporary file,
 * is flushed to disk and renamed over the old one, retried when the rename is briefly blocked; a read that finds
 * a corrupt file keeps it aside instead of letting the next write overwrite it, and a locked file is never taken
 * for an empty one.
 */
import { closeSync, existsSync, fchmodSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** The file operations used, so tests can make them fail like Windows does. */
export interface FileIo {
  readFile(path: string): string;
  /** Create the file (it must not exist), write and flush it to disk. */
  writeFile(path: string, data: string, mode?: number): void;
  rename(from: string, to: string): void;
  remove(path: string): void;
  sleep(ms: number): void;
}

const pause = new Int32Array(new SharedArrayBuffer(4));

export const defaultIo: FileIo = {
  readFile: (path) => readFileSync(path, 'utf8'),
  writeFile(path, data, mode) {
    const fd = openSync(path, 'wx', mode);
    try {
      // The umask may have narrowed the mode; the file gets exactly the one asked for.
      if (mode !== undefined && process.platform !== 'win32') fchmodSync(fd, mode);
      writeSync(fd, data);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  },
  rename: (from, to) => renameSync(from, to),
  remove: (path) => rmSync(path, { force: true }),
  // The stores are synchronous; a few short waits are fine there.
  sleep: (ms) => void Atomics.wait(pause, 0, 0, ms),
};

/** Errors Windows gives while another process briefly holds a file. */
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES']);
const BACKOFF_MS = [20, 50, 100, 200, 400];

const codeOf = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code ?? '';

function withRetry<T>(io: FileIo, action: () => T): T {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return action();
    } catch (error) {
      const wait = BACKOFF_MS[attempt];
      if (!TRANSIENT.has(codeOf(error)) || wait === undefined) throw error;
      io.sleep(wait);
    }
  }
}

/** The async form for async stores: run `action`, retrying while Windows briefly holds the file. */
export async function retryTransient<T>(action: () => Promise<T>, wait: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms))): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      const delay = BACKOFF_MS[attempt];
      if (!TRANSIENT.has(codeOf(error)) || delay === undefined) throw error;
      await wait(delay);
    }
  }
}

let counter = 0;

/** Replace a file's content atomically; on failure the old file stays as it was and no temporary file is left. */
export function writeFileAtomic(file: string, data: string, io: FileIo = defaultIo, mode?: number): void {
  mkdirSync(dirname(file), { recursive: true });
  counter += 1;
  const temp = join(dirname(file), `.${basename(file)}.${process.pid}.${counter}.tmp`);
  try {
    io.writeFile(temp, data, mode);
    withRetry(io, () => io.rename(temp, file));
  } catch (error) {
    try {
      io.remove(temp);
    } catch {
      // Nothing more to do about a temporary file that cannot be removed either.
    }
    throw error;
  }
}

/** JSON with a trailing newline, pretty unless `compact`. */
export function writeJsonAtomic(file: string, value: unknown, { compact = false, io = defaultIo }: { compact?: boolean; io?: FileIo } = {}): void {
  writeFileAtomic(file, `${compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)}\n`, io);
}

/** Read a file, retrying while another process briefly holds it; undefined when it does not exist. */
export function readTextFile(file: string, io: FileIo = defaultIo): string | undefined {
  if (!existsSync(file)) return undefined;
  try {
    return withRetry(io, () => io.readFile(file));
  } catch (error) {
    if (codeOf(error) === 'ENOENT') return undefined;
    throw error;
  }
}

export interface ReadJsonOptions<T> {
  /** What a missing (or corrupt) file stands for. */
  readonly fallback: T;
  /** Shape the parsed JSON; undefined means the content is not what the file should hold (treated as corrupt). */
  readonly parse: (raw: unknown) => T | undefined;
  readonly io?: FileIo;
  readonly log?: (message: string) => void;
}

/**
 * Read a JSON state file. Missing: the fallback. Corrupt (not JSON, or the wrong shape): the file is renamed to
 * `<name>.corrupt-<time>` and logged, then the fallback, so the next write cannot silently destroy it. Locked:
 * retried, then the error is thrown (never mistaken for an empty file).
 */
export function readJsonFile<T>(
  file: string,
  { fallback, parse, io = defaultIo, log = (message) => console.warn(message) }: ReadJsonOptions<T>,
): T {
  const text = readTextFile(file, io);
  if (text === undefined) return fallback;
  let value: T | undefined;
  try {
    value = parse(JSON.parse(text.replace(/^﻿/, '')));
  } catch {
    value = undefined;
  }
  if (value !== undefined) return value;
  const aside = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    withRetry(io, () => io.rename(file, aside));
  } catch (error) {
    // Could not move it: refuse rather than overwrite it later.
    throw new Error(`${file} is corrupt and could not be set aside (${codeOf(error) || String(error)})`);
  }
  log(`[storage] ${file} was corrupt; kept it as ${aside} and started from empty`);
  return fallback;
}
