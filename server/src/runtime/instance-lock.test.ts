import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { acquireInstanceLock, InstanceRunningError, isAlive, LOCK_FILE } from './instance-lock.ts';

describe('acquireInstanceLock', () => {
  it('takes the data folder and gives it back', () => {
    const dataDir = makeTree({});
    const release = acquireInstanceLock({ dataDir, port: 4800, pid: 111, alive: () => true });
    expect(JSON.parse(readFileSync(join(dataDir, LOCK_FILE), 'utf8'))).toMatchObject({ pid: 111, port: 4800 });
    release();
    expect(existsSync(join(dataDir, LOCK_FILE))).toBe(false);
  });

  it('refuses a second server on the same data folder, saying where the first one runs', () => {
    const dataDir = makeTree({});
    acquireInstanceLock({ dataDir, port: 4800, pid: 111, alive: () => true });
    const second = () => acquireInstanceLock({ dataDir, port: 4801, pid: 222, alive: () => true });
    expect(second).toThrow(InstanceRunningError);
    expect(second).toThrow('Agent Studio is already running at http://127.0.0.1:4800 (pid 111)');
  });

  it('takes over a lock left behind by a process that is gone, or an unreadable one', () => {
    const dataDir = makeTree({});
    acquireInstanceLock({ dataDir, port: 4800, pid: 111, alive: () => true });
    acquireInstanceLock({ dataDir, port: 4801, pid: 222, alive: (pid) => pid !== 111 });
    expect(JSON.parse(readFileSync(join(dataDir, LOCK_FILE), 'utf8'))).toMatchObject({ pid: 222 });

    writeFileSync(join(dataDir, LOCK_FILE), 'garbage');
    expect(() => acquireInstanceLock({ dataDir, port: 4802, pid: 333, alive: () => true })).not.toThrow();
  });

  it('does not remove a lock another process has taken since', () => {
    const dataDir = makeTree({});
    const release = acquireInstanceLock({ dataDir, port: 4800, pid: 111, alive: () => false });
    acquireInstanceLock({ dataDir, port: 4801, pid: 222, alive: () => false });
    release();
    expect(existsSync(join(dataDir, LOCK_FILE))).toBe(true);
  });

  it('knows this process is alive and a made-up one is not', () => {
    expect(isAlive(process.pid)).toBe(true);
    expect(isAlive(2 ** 22 + 12345)).toBe(false);
  });
});
