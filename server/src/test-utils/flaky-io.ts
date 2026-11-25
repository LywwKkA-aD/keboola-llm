import { vi } from 'vitest';
import { defaultIo, type FileIo } from '../storage/json-file.ts';

export const busy = (code: string) => Object.assign(new Error(`${code}: operation not permitted`), { code });

/** The real file system, with renames failing `times` times with `code` first (Windows antivirus, OneDrive). */
export function flakyRename(times: number, code = 'EPERM'): FileIo & { attempts: number; sleep: ReturnType<typeof vi.fn> } {
  const io = { ...defaultIo, attempts: 0, sleep: vi.fn() };
  io.rename = (from: string, to: string) => {
    io.attempts += 1;
    if (io.attempts <= times) throw busy(code);
    defaultIo.rename(from, to);
  };
  return io;
}
