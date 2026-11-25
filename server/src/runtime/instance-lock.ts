/**
 * One server per data folder. Two would each keep their own copy of the chats, approvals and routine state in memory
 * and overwrite each other's files, and both would run every routine. A lock file in the data folder says which
 * process owns it; one left behind by a process that is gone (a crash, a closed window) is taken over.
 */
import { closeSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { join } from 'node:path';

export const LOCK_FILE = 'server.lock';

interface Owner {
  readonly pid: number;
  readonly port: number;
}

export class InstanceRunningError extends Error {
  readonly owner: Owner;

  constructor(owner: Owner) {
    super(
      `Agent Studio is already running at http://127.0.0.1:${owner.port} (pid ${owner.pid}) with this data folder. ` +
        'Open that address, or close the other window (Ctrl+C) before starting it again.',
    );
    this.owner = owner;
  }
}

/** Whether a process with this id is alive (a process we may not signal still exists). */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readOwner(file: string): Owner | undefined {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<Owner>;
    return Number.isInteger(parsed.pid) && Number.isInteger(parsed.port) ? { pid: parsed.pid as number, port: parsed.port as number } : undefined;
  } catch {
    return undefined;
  }
}

/** Take the data folder for this process, or throw InstanceRunningError. Returns the release function. */
export function acquireInstanceLock({ dataDir, port, pid = process.pid, alive = isAlive }: {
  dataDir: string;
  port: number;
  pid?: number;
  alive?: (pid: number) => boolean;
}): () => void {
  const file = join(dataDir, LOCK_FILE);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(file, 'wx');
      try {
        writeSync(fd, `${JSON.stringify({ pid, port, startedAt: new Date().toISOString() })}\n`);
      } finally {
        closeSync(fd);
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (readOwner(file)?.pid === pid) rmSync(file, { force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const owner = readOwner(file);
      if (owner && owner.pid !== pid && alive(owner.pid)) throw new InstanceRunningError(owner);
      // Left behind by a process that is gone (or unreadable): take it over.
      rmSync(file, { force: true });
    }
  }
  throw new Error(`Could not take the lock ${file}`);
}
