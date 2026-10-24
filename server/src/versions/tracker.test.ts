import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { createDefinitionVersions } from './tracker.ts';

function setup(files: Record<string, string> = { 'agents/lead/AGENT.md': 'lead v1', 'skills/sql-style/SKILL.md': 'style v1' }) {
  const root = makeTree(files);
  let clock = Date.parse('2026-10-24T10:00:00Z');
  const now = () => new Date((clock += 1000));
  const create = () => createDefinitionVersions({ rootDir: root, dir: join(root, 'data', 'history'), now });
  const file = (rel: string) => join(root, rel);
  return { root, create, versions: create(), file };
}

const writeNew = (path: string, content: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

const changes = (list: readonly { change: string }[]) => list.map((version) => version.change);

describe('createDefinitionVersions', () => {
  it('takes a baseline of agents and custom skills on start', () => {
    const { versions } = setup();
    versions.sync('start');

    expect(versions.list('agents', 'lead')).toEqual([{ id: 1, at: '2026-10-24T10:00:01.000Z', change: 'baseline', size: 7 }]);
    expect(changes(versions.list('skills', 'sql-style'))).toEqual(['baseline']);
    expect(versions.get('agents', 'lead', 1)).toMatchObject({ content: 'lead v1', current: 'lead v1' });
  });

  it('records changes, creations and deletions whatever made them, newest first', () => {
    const { versions, file } = setup();
    versions.sync('start');

    writeFileSync(file('agents/lead/AGENT.md'), 'lead v2 is longer');
    writeFileSync(file('skills/sql-style/SKILL.md'), 'style v1');
    writeNew(file('agents/scout/AGENT.md'), 'scout v1');
    versions.sync('change');
    rmSync(file('agents/scout'), { recursive: true });
    versions.sync('change');
    versions.sync('change');

    expect(versions.list('agents', 'lead').map(({ id, change, size }) => [id, change, size])).toEqual([
      [2, 'changed', 17],
      [1, 'baseline', 7],
    ]);
    expect(changes(versions.list('skills', 'sql-style'))).toEqual(['baseline']);
    expect(changes(versions.list('agents', 'scout'))).toEqual(['deleted', 'created']);
    expect(versions.get('agents', 'scout', 2)).toMatchObject({ change: 'deleted', size: 0, content: null, current: null });
  });

  it('catches up with the file when the history is read, so a change the watcher missed still shows', () => {
    const { versions, file } = setup();
    versions.sync('start');
    rmSync(file('skills/sql-style'), { recursive: true });
    versions.sync('change');
    // Re-created right away; the watcher of a removed folder may never report it.
    writeNew(file('skills/sql-style/SKILL.md'), 'style v2');

    expect(changes(versions.list('skills', 'sql-style'))).toEqual(['created', 'deleted', 'baseline']);
    expect(changes(versions.list('skills', 'sql-style'))).toEqual(['created', 'deleted', 'baseline']);
  });

  it('notices what changed while the app was off', () => {
    const { create, file } = setup();
    create().sync('start');
    writeFileSync(file('agents/lead/AGENT.md'), 'pulled from git');
    rmSync(file('skills/sql-style'), { recursive: true });

    const versions = create();
    versions.sync('start');
    expect(changes(versions.list('agents', 'lead'))).toEqual(['changed', 'baseline']);
    expect(changes(versions.list('skills', 'sql-style'))).toEqual(['deleted', 'baseline']);
  });

  it('lists tracked definitions, deleted ones included', () => {
    const { versions, file } = setup();
    versions.sync('start');
    rmSync(file('agents/lead'), { recursive: true });
    versions.sync('change');

    expect(versions.tracked('agents')).toEqual([{ name: 'lead', exists: false, last: expect.objectContaining({ id: 2, change: 'deleted' }) }]);
    expect(versions.tracked('skills')).toEqual([{ name: 'sql-style', exists: true, last: expect.objectContaining({ id: 1 }) }]);
  });

  it('restores an older version and records it once, even when the file watcher syncs again', () => {
    const { versions, file } = setup();
    versions.sync('start');
    writeFileSync(file('agents/lead/AGENT.md'), 'broken edit');
    versions.sync('change');

    expect(versions.restore('agents', 'lead', 1)).toEqual({ ok: true, changed: true, version: expect.objectContaining({ id: 3, change: 'restored', restoredFrom: 1 }) });
    expect(readFileSync(file('agents/lead/AGENT.md'), 'utf8')).toBe('lead v1');
    versions.sync('change');
    expect(changes(versions.list('agents', 'lead'))).toEqual(['restored', 'changed', 'baseline']);
  });

  it('records an edit nobody synced yet before restoring over it', () => {
    const { versions, file } = setup();
    versions.sync('start');
    writeFileSync(file('agents/lead/AGENT.md'), 'unsynced edit');

    versions.restore('agents', 'lead', 1);
    expect(changes(versions.list('agents', 'lead'))).toEqual(['restored', 'changed', 'baseline']);
    expect(versions.get('agents', 'lead', 2)?.content).toBe('unsynced edit');
  });

  it('recreates a deleted definition', () => {
    const { versions, file } = setup();
    versions.sync('start');
    rmSync(file('skills/sql-style'), { recursive: true });
    versions.sync('change');

    expect(versions.restore('skills', 'sql-style', 1)).toMatchObject({ ok: true, changed: true });
    expect(readFileSync(file('skills/sql-style/SKILL.md'), 'utf8')).toBe('style v1');
    expect(versions.tracked('skills')[0]?.exists).toBe(true);
  });

  it('does nothing when the version equals the current file', () => {
    const { versions } = setup();
    versions.sync('start');
    expect(versions.restore('agents', 'lead', 1)).toEqual({ ok: true, changed: false });
    expect(versions.list('agents', 'lead')).toHaveLength(1);
  });

  it('refuses unknown versions and deletion markers', () => {
    const { versions, file } = setup();
    versions.sync('start');
    rmSync(file('agents/lead'), { recursive: true });
    versions.sync('change');

    expect(versions.restore('agents', 'lead', 9)).toEqual({ ok: false, reason: 'not-found' });
    expect(versions.restore('agents', 'ghost', 1)).toEqual({ ok: false, reason: 'not-found' });
    expect(versions.restore('agents', 'lead', 2)).toEqual({ ok: false, reason: 'deleted' });
    expect(versions.get('agents', 'lead', 9)).toBeUndefined();
  });

  it('returns what each sync recorded', () => {
    const { versions, file } = setup();
    expect(versions.sync('start')).toEqual([
      { kind: 'agents', name: 'lead', change: 'baseline' },
      { kind: 'skills', name: 'sql-style', change: 'baseline' },
    ]);
    expect(versions.sync('change')).toEqual([]);
    writeFileSync(file('agents/lead/AGENT.md'), 'v2');
    expect(versions.sync('change')).toEqual([{ kind: 'agents', name: 'lead', change: 'changed' }]);
  });
});
