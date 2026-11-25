import { describe, expect, it } from 'vitest';
import { compareKbagent, snapshotVersions } from './kbagent-version.mjs';

describe('snapshotVersions', () => {
  it('reads every version the snapshot was made from', () => {
    expect(snapshotVersions('/**\n * Snapshot of kbagent v0.100.4, v1.4.1 operations, generated')).toEqual(['0.100.4', '1.4.1']);
    expect(snapshotVersions('/**\n * Snapshot of kbagent v0.100.2 operations, generated')).toEqual(['0.100.2']);
    expect(snapshotVersions('nothing here')).toEqual([]);
  });
});

describe('compareKbagent', () => {
  it('is ok when the installed version is one the snapshot covers', () => {
    expect(compareKbagent('kbagent v1.4.1', ['0.100.4', '1.4.1'])).toEqual({ level: 'ok', detail: 'kbagent v1.4.1' });
    expect(compareKbagent('kbagent v0.100.4', ['0.100.4', '1.4.1']).level).toBe('ok');
  });

  it('warns when the installed CLI is another version', () => {
    expect(compareKbagent('kbagent v1.5.0', ['0.100.4', '1.4.1'])).toEqual({
      level: 'warn',
      detail: 'kbagent v1.5.0, but the permission snapshot is for 0.100.4, 1.4.1: new commands of this version are refused until npm run kbagent:snapshot',
    });
  });

  it('is ok when the snapshot versions are unknown', () => {
    expect(compareKbagent('kbagent v0.1.0', []).level).toBe('ok');
  });
});
