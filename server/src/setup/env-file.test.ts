import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { formatEnvValue, setEnvValues, writeEnvValues } from './env-file.ts';

const EXAMPLE = [
  '# Copy this file to .env and fill in the values. Never commit .env.',
  '',
  '# OmniRoute - local AI router (https://omniroute.online).',
  'OMNIROUTE_BASE_URL=http://127.0.0.1:20128/v1',
  'OMNIROUTE_API_KEY=',
  '# Model id exactly as listed by OmniRoute (GET /v1/models), e.g. a combo or provider/model.',
  'OMNIROUTE_MODEL=cc/model',
  '',
  'KEBOOLA_PROJECT=sandbox',
  '',
].join('\n');

describe('setEnvValues', () => {
  it('replaces the value in place and keeps every other line and comment', () => {
    const next = setEnvValues(EXAMPLE, { OMNIROUTE_API_KEY: 'sk-new-key' });
    expect(next).toBe(EXAMPLE.replace('OMNIROUTE_API_KEY=\n', 'OMNIROUTE_API_KEY=sk-new-key\n'));
    expect(parseEnv(next)).toEqual({
      OMNIROUTE_BASE_URL: 'http://127.0.0.1:20128/v1',
      OMNIROUTE_API_KEY: 'sk-new-key',
      OMNIROUTE_MODEL: 'cc/model',
      KEBOOLA_PROJECT: 'sandbox',
    });
  });

  it('appends a missing key at the end, adding the newline the file lacks', () => {
    expect(setEnvValues('A=1', { OMNIROUTE_API_KEY: 'k' })).toBe('A=1\nOMNIROUTE_API_KEY=k\n');
    expect(setEnvValues('', { OMNIROUTE_API_KEY: 'k' })).toBe('OMNIROUTE_API_KEY=k\n');
    expect(setEnvValues('# only a comment\n', { B: 'x' })).toBe('# only a comment\nB=x\n');
  });

  it('keeps CRLF line endings, also for an appended key', () => {
    const crlf = '# comment\r\nOMNIROUTE_API_KEY=old\r\nOTHER=1\r\n';
    expect(setEnvValues(crlf, { OMNIROUTE_API_KEY: 'new', OMNIROUTE_BASE_URL: 'http://h:1/v1' })).toBe(
      '# comment\r\nOMNIROUTE_API_KEY=new\r\nOTHER=1\r\nOMNIROUTE_BASE_URL=http://h:1/v1\r\n',
    );
  });

  it('leaves commented-out assignments, export prefixes and indentation alone', () => {
    const text = '# OMNIROUTE_API_KEY=commented\n  export OMNIROUTE_API_KEY="old" # rotated monthly\n';
    const next = setEnvValues(text, { OMNIROUTE_API_KEY: 'new' });
    expect(next).toBe('# OMNIROUTE_API_KEY=commented\n  export OMNIROUTE_API_KEY=new # rotated monthly\n');
    expect(parseEnv(next).OMNIROUTE_API_KEY).toBe('new');
  });

  it('updates every duplicate so a later line cannot win with the old value', () => {
    const next = setEnvValues('K=a\nX=1\nK=b\n', { K: 'c' });
    expect(next).toBe('K=c\nX=1\nK=c\n');
    expect(parseEnv(next).K).toBe('c');
  });

  it('does not touch lines inside another multi-line value', () => {
    const text = 'CERT="-----BEGIN-----\nOMNIROUTE_API_KEY=inside\n-----END-----"\nOMNIROUTE_API_KEY=old\n';
    const next = setEnvValues(text, { OMNIROUTE_API_KEY: 'new' });
    expect(next).toBe(text.replace('OMNIROUTE_API_KEY=old', 'OMNIROUTE_API_KEY=new'));
    expect(parseEnv(next).CERT).toContain('OMNIROUTE_API_KEY=inside');
  });

  it('replaces a multi-line value of the key itself with one line', () => {
    expect(setEnvValues("K='line 1\nline 2'\nB=2\n", { K: 'one' })).toBe('K=one\nB=2\n');
  });

  it('quotes values that dotenv would otherwise cut or expand', () => {
    const next = setEnvValues('', { A: 'abc#def', B: 'has space', C: "it's$x" });
    expect(parseEnv(next)).toEqual({ A: 'abc#def', B: 'has space', C: "it's$x" });
  });

  it('keeps a byte order mark at the start of the file', () => {
    expect(setEnvValues('﻿K=old\n', { K: 'new' })).toBe('﻿K=new\n');
  });
});

describe('formatEnvValue', () => {
  it('writes plain tokens and URLs as they are', () => {
    expect(formatEnvValue('sk-abc_123.XYZ')).toBe('sk-abc_123.XYZ');
    expect(formatEnvValue('http://127.0.0.1:20128/v1')).toBe('http://127.0.0.1:20128/v1');
  });

  it('single-quotes anything else and refuses what no quoting keeps intact', () => {
    expect(formatEnvValue('a#b')).toBe("'a#b'");
    expect(formatEnvValue("a'b")).toBe('"a\'b"');
    expect(() => formatEnvValue('line\nbreak')).toThrow();
    expect(() => formatEnvValue('a\'b"c')).toThrow();
  });
});

describe('writeEnvValues', () => {
  it('rewrites the file atomically and leaves no temp files behind', () => {
    const root = makeTree({ '.env': EXAMPLE });
    const file = join(root, '.env');
    writeEnvValues(file, { OMNIROUTE_API_KEY: 'sk-1' });

    expect(parseEnv(readFileSync(file, 'utf8')).OMNIROUTE_API_KEY).toBe('sk-1');
    expect(readFileSync(file, 'utf8')).toContain('# Model id exactly as listed by OmniRoute');
    expect(readdirSync(root)).toEqual(['.env']);
  });

  it('starts a missing .env from the template, with owner-only permissions', () => {
    const root = makeTree({ '.env.example': EXAMPLE });
    const file = join(root, '.env');
    writeEnvValues(file, { OMNIROUTE_API_KEY: 'sk-2' }, { template: join(root, '.env.example') });

    expect(readFileSync(file, 'utf8')).toBe(EXAMPLE.replace('OMNIROUTE_API_KEY=\n', 'OMNIROUTE_API_KEY=sk-2\n'));
    expect(readFileSync(join(root, '.env.example'), 'utf8')).toBe(EXAMPLE);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('creates a bare file when there is no template either', () => {
    const root = makeTree({});
    const file = join(root, '.env');
    writeEnvValues(file, { K: 'v' }, { template: join(root, 'missing.example') });
    expect(readFileSync(file, 'utf8')).toBe('K=v\n');
  });

  it('keeps the permissions of an existing file', () => {
    if (process.platform === 'win32') return;
    const root = makeTree({});
    const file = join(root, '.env');
    writeFileSync(file, 'K=old\n', { mode: 0o640 });
    writeEnvValues(file, { K: 'new' });
    expect(statSync(file).mode & 0o777).toBe(0o640);
  });

  it('leaves the old file untouched when a value cannot be written', () => {
    const root = makeTree({ '.env': 'K=old\n' });
    const file = join(root, '.env');
    expect(() => writeEnvValues(file, { K: 'a\nb' })).toThrow();
    expect(readFileSync(file, 'utf8')).toBe('K=old\n');
    expect(readdirSync(root)).toEqual(['.env']);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });
});
