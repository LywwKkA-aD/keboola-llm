import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDotEnv } from './dotenv.mjs';

const KEY = 'KEBOOLA_LLM_DOTENV_TEST';

afterEach(() => {
  delete process.env[KEY];
});

describe('loadDotEnv', () => {
  it('loads KEY=VALUE pairs into process.env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dotenv-'));
    writeFileSync(join(dir, '.env'), `${KEY}=hello\n`);

    expect(loadDotEnv(join(dir, '.env'))).toBe(true);
    expect(process.env[KEY]).toBe('hello');
  });

  it('returns false when the file does not exist', () => {
    expect(loadDotEnv(join(tmpdir(), 'definitely-missing', '.env'))).toBe(false);
  });

  it('rethrows other errors, e.g. a directory instead of a file', () => {
    expect(() => loadDotEnv(mkdtempSync(join(tmpdir(), 'dotenv-dir-')))).toThrow();
  });
});
