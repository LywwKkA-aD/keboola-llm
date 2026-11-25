import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { busy, flakyRename } from '../test-utils/flaky-io.ts';
import { defaultIo, type FileIo, readJsonFile, writeFileAtomic, writeJsonAtomic } from './json-file.ts';

const dirs: string[] = [];
const dir = () => {
  const made = mkdtempSync(join(tmpdir(), 'json-file-'));
  dirs.push(made);
  return made;
};
afterEach(() => dirs.splice(0).forEach((made) => rmSync(made, { recursive: true, force: true })));

describe('writeFileAtomic', () => {
  it('writes through a temporary file and leaves nothing else behind', () => {
    const folder = dir();
    const file = join(folder, 'sub', 'a.json');
    writeFileAtomic(file, 'hello');
    expect(readFileSync(file, 'utf8')).toBe('hello');
    expect(readdirSync(join(folder, 'sub'))).toEqual(['a.json']);
  });

  it('retries a rename a Windows antivirus or OneDrive briefly blocks', () => {
    const file = join(dir(), 'a.json');
    const io = flakyRename(2, 'EBUSY');
    writeFileAtomic(file, 'v2', io);
    expect(readFileSync(file, 'utf8')).toBe('v2');
    expect(io.attempts).toBe(3);
    expect(io.sleep).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retries, keeps the old file and removes the temporary one', () => {
    const folder = dir();
    const file = join(folder, 'a.json');
    writeFileSync(file, 'v1');
    expect(() => writeFileAtomic(file, 'v2', flakyRename(99))).toThrow(/EPERM/);
    expect(readFileSync(file, 'utf8')).toBe('v1');
    expect(readdirSync(folder)).toEqual(['a.json']);
  });

  it('does not retry an error that will not pass', () => {
    const io = flakyRename(1, 'ENOSPC');
    expect(() => writeFileAtomic(join(dir(), 'a.json'), 'x', io)).toThrow(/ENOSPC/);
    expect(io.attempts).toBe(1);
  });
});

describe('readJsonFile', () => {
  const asList = (value: unknown) => (Array.isArray(value) ? (value as string[]) : undefined);

  it('reads a file and falls back for a missing one', () => {
    const file = join(dir(), 'a.json');
    expect(readJsonFile(file, { fallback: ['none'], parse: asList })).toEqual(['none']);
    writeJsonAtomic(file, ['x']);
    expect(readJsonFile(file, { fallback: [], parse: asList })).toEqual(['x']);
  });

  it('keeps a corrupt file aside instead of letting the next write overwrite it', () => {
    const folder = dir();
    const file = join(folder, 'threads.json');
    writeFileSync(file, '[{"id":"old","title":"Old ch');
    const log = vi.fn();
    expect(readJsonFile(file, { fallback: [], parse: asList, log })).toEqual([]);
    const aside = readdirSync(folder).find((name) => name.startsWith('threads.json.corrupt-'));
    expect(aside).toBeDefined();
    expect(readFileSync(join(folder, aside as string), 'utf8')).toBe('[{"id":"old","title":"Old ch');
    expect(existsSync(file)).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/threads\.json.*corrupt/));
  });

  it('treats content of the wrong shape as corrupt too, and reads past a BOM', () => {
    const folder = dir();
    const file = join(folder, 'a.json');
    writeFileSync(file, '﻿["ok"]');
    expect(readJsonFile(file, { fallback: [], parse: asList })).toEqual(['ok']);
    writeFileSync(file, '{"not":"a list"}');
    expect(readJsonFile(file, { fallback: [], parse: asList, log: () => {} })).toEqual([]);
    expect(readdirSync(folder).some((name) => name.startsWith('a.json.corrupt-'))).toBe(true);
  });

  it('retries a busy read and never takes a locked file for an empty one', () => {
    const file = join(dir(), 'a.json');
    writeJsonAtomic(file, ['x']);
    let reads = 0;
    const once: FileIo = {
      ...defaultIo,
      sleep: vi.fn(),
      readFile: (path) => {
        reads += 1;
        if (reads === 1) throw busy('EBUSY');
        return defaultIo.readFile(path);
      },
    };
    expect(readJsonFile(file, { fallback: [], parse: asList, io: once })).toEqual(['x']);
    const locked: FileIo = {
      ...defaultIo,
      sleep: vi.fn(),
      readFile: () => {
        throw busy('EPERM');
      },
    };
    expect(() => readJsonFile(file, { fallback: [], parse: asList, io: locked })).toThrow(/EPERM/);
  });
});
