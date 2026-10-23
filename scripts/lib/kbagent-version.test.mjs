import { describe, expect, it } from 'vitest';
import { compareKbagent, snapshotVersion } from './kbagent-version.mjs';

describe('snapshotVersion', () => {
  it('reads the version from the snapshot header', () => {
    expect(snapshotVersion('/**\n * Snapshot of kbagent v0.100.2 operations, generated')).toBe('0.100.2');
    expect(snapshotVersion('nothing here')).toBeNull();
  });
});

describe('compareKbagent', () => {
  it('is ok when versions match', () => {
    expect(compareKbagent('kbagent v0.100.2', '0.100.2')).toEqual({ level: 'ok', detail: 'kbagent v0.100.2' });
  });

  it('warns when the installed CLI differs from the snapshot', () => {
    expect(compareKbagent('kbagent v0.101.0', '0.100.2')).toEqual({
      level: 'warn',
      detail: 'kbagent v0.101.0, but the permission snapshot is for 0.100.2: run npm run kbagent:snapshot',
    });
  });

  it('is ok when the snapshot version is unknown', () => {
    expect(compareKbagent('kbagent v0.1.0', null).level).toBe('ok');
  });
});
