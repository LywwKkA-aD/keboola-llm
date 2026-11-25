import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { setEnvValues } from '../setup/env-file.ts';
import { isUtf16, loadDotEnv } from './dotenv.ts';

const fileWith = (content: string | Buffer) => {
  const file = join(makeTree({}), '.env');
  writeFileSync(file, content);
  return file;
};

describe('loadDotEnv', () => {
  it('reads the first key of a file that starts with a byte order mark (PowerShell 5.1, Notepad)', () => {
    const env: NodeJS.ProcessEnv = {};
    loadDotEnv(fileWith('﻿OMNIROUTE_API_KEY=key-1\r\nOMNIROUTE_MODEL=cx/sol\r\n'), env);
    expect(env).toEqual({ OMNIROUTE_API_KEY: 'key-1', OMNIROUTE_MODEL: 'cx/sol' });
  });

  it('says a UTF-16 file cannot be read instead of silently using nothing', () => {
    const env: NodeJS.ProcessEnv = {};
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('OMNIROUTE_MODEL=m\r\n', 'utf16le')]);
    const result = loadDotEnv(fileWith(utf16), env);
    expect(env).toEqual({});
    expect(result.warnings[0]).toMatch(/UTF-16.*UTF-8/);
    expect(isUtf16(Buffer.from('OMNIROUTE_MODEL=m\r\n', 'utf16le'))).toBe(true);
    expect(isUtf16(Buffer.from('OMNIROUTE_MODEL=m\n'))).toBe(false);
  });

  it('lets the OmniRoute settings in .env win over a user-level variable, and says so', () => {
    const env: NodeJS.ProcessEnv = { OMNIROUTE_API_KEY: 'old-user-key', PORT: '4900' };
    const result = loadDotEnv(fileWith('OMNIROUTE_API_KEY=wizard-key\nPORT=4800\n'), env);
    expect(env).toEqual({ OMNIROUTE_API_KEY: 'wizard-key', PORT: '4900' });
    expect(result.warnings).toEqual([expect.stringMatching(/OMNIROUTE_API_KEY is also set in your environment/)]);
    expect(result.warnings.join(' ')).not.toContain('wizard-key');
  });

  it('reports a missing file', () => {
    expect(loadDotEnv(join(makeTree({}), '.env'), {})).toEqual({ found: false, warnings: [] });
  });
});

describe('the setup wizard and a byte order mark', () => {
  it('drops the byte order mark when it writes the key, so Node reads it after a restart', () => {
    const next = setEnvValues('﻿OMNIROUTE_API_KEY=\nOMNIROUTE_MODEL=m\n', { OMNIROUTE_API_KEY: 'key-1' });
    expect(next.startsWith('﻿')).toBe(false);
    const env: NodeJS.ProcessEnv = {};
    loadDotEnv(fileWith(next), env);
    expect(env.OMNIROUTE_API_KEY).toBe('key-1');
  });
});
