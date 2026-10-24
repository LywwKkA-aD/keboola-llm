import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { createVersionLog } from './log.ts';

const entry = (content: string, at = '2026-10-24T10:00:00.000Z') =>
  ({ at, change: 'changed', size: content.length, hash: `h-${content}`, content }) as const;

describe('createVersionLog', () => {
  it('numbers versions per definition and keeps them across restarts', () => {
    const dir = join(makeTree({}), 'history');
    const log = createVersionLog({ dir });
    expect(log.append('agents', 'lead', entry('one')).id).toBe(1);
    expect(log.append('agents', 'lead', entry('two')).id).toBe(2);
    expect(log.append('skills', 'lead', entry('skill')).id).toBe(1);

    const reopened = createVersionLog({ dir });
    expect(reopened.read('agents', 'lead').map((version) => version.content)).toEqual(['one', 'two']);
    expect(reopened.read('skills', 'lead')).toHaveLength(1);
    expect(reopened.read('agents', 'ghost')).toEqual([]);
  });

  it('keeps only the newest versions but never reuses an id', () => {
    const log = createVersionLog({ dir: join(makeTree({}), 'history'), limit: 3 });
    ['a', 'b', 'c', 'd', 'e'].forEach((content) => log.append('agents', 'lead', entry(content)));

    expect(log.read('agents', 'lead').map((version) => [version.id, version.content])).toEqual([
      [3, 'c'],
      [4, 'd'],
      [5, 'e'],
    ]);
  });

  it('lists the definitions that have a history', () => {
    const dir = join(makeTree({}), 'history');
    const log = createVersionLog({ dir });
    log.append('agents', 'scout', entry('x'));
    log.append('agents', 'lead', entry('y'));
    mkdirSync(join(dir, 'agents'), { recursive: true });
    writeFileSync(join(dir, 'agents', 'Not_Valid.json'), '{"versions":[]}');
    writeFileSync(join(dir, 'agents', 'notes.txt'), 'x');

    expect(log.names('agents')).toEqual(['lead', 'scout']);
    expect(log.names('skills')).toEqual([]);
  });

  it('writes one JSON file per definition and leaves no temp files behind', () => {
    const dir = join(makeTree({}), 'history');
    createVersionLog({ dir }).append('agents', 'lead', entry('x'));

    expect(readdirSync(join(dir, 'agents'))).toEqual(['lead.json']);
    expect(JSON.parse(readFileSync(join(dir, 'agents', 'lead.json'), 'utf8'))).toMatchObject({ versions: [{ id: 1, content: 'x' }] });
  });

  it('treats a damaged file as an empty history', () => {
    const dir = join(makeTree({}), 'history');
    mkdirSync(join(dir, 'agents'), { recursive: true });
    writeFileSync(join(dir, 'agents', 'lead.json'), '{broken');
    writeFileSync(join(dir, 'agents', 'scout.json'), '{"versions":[{"id":"x"},{"id":2,"at":"t","change":"changed","size":1,"hash":"h","content":"ok"}]}');
    const log = createVersionLog({ dir });

    expect(log.read('agents', 'lead')).toEqual([]);
    expect(log.read('agents', 'scout').map((version) => version.id)).toEqual([2]);
    expect(log.append('agents', 'lead', entry('fresh')).id).toBe(1);
  });

  it('refuses invalid names', () => {
    const log = createVersionLog({ dir: join(makeTree({}), 'history') });
    expect(() => log.read('agents', '../x')).toThrow(/Invalid definition name/);
    expect(() => log.append('skills', 'a/b', entry('x'))).toThrow(/Invalid definition name/);
  });
});
