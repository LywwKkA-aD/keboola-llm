/**
 * Read .env into process.env the way a Windows user's file needs: a UTF-8 byte order mark (PowerShell 5.1's
 * `Set-Content -Encoding UTF8`, older Notepad) would hide the first key from process.loadEnvFile, and a UTF-16 file
 * (PowerShell 5.1's `>`) is unreadable as it is, so it is reported. The OmniRoute settings in .env win over the same
 * variables set in the user's environment: the setup wizard saves the key there, and an old user-level variable must
 * not silently beat it. Other variables keep the usual rule (the environment wins).
 */
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** Variables .env sets even when the environment already has them, with a warning. */
const ENV_FILE_WINS = /^OMNIROUTE_/;

export interface DotEnvResult {
  /** Whether a .env file was there. */
  readonly found: boolean;
  /** What the user should know, in English (doctor and the server log print it). */
  readonly warnings: readonly string[];
}

/** Whether bytes are UTF-16 text: a UTF-16 byte order mark, or zero bytes between ASCII letters. */
export function isUtf16(bytes: Uint8Array): boolean {
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) return true;
  const sample = bytes.subarray(0, 64);
  const zeros = sample.filter((byte) => byte === 0).length;
  return sample.length >= 8 && zeros >= sample.length / 4;
}

/** Parse .env text: a leading byte order mark is ignored. */
export const parseDotEnv = (text: string): Record<string, string> =>
  Object.fromEntries(Object.entries(parseEnv(text.replace(/^﻿/, ''))).filter((entry): entry is [string, string] => entry[1] !== undefined));

/** Load `file` into `env` (process.env by default). */
export function loadDotEnv(file: string, env: NodeJS.ProcessEnv = process.env): DotEnvResult {
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { found: false, warnings: [] };
    throw error;
  }
  if (isUtf16(bytes)) {
    return {
      found: true,
      warnings: [`${file} is saved as UTF-16 and cannot be read: save it as UTF-8 (in Notepad: Save as, Encoding UTF-8)`],
    };
  }
  const warnings: string[] = [];
  Object.entries(parseDotEnv(bytes.toString('utf8'))).forEach(([key, value]) => {
    const current = env[key];
    if (current === undefined) {
      env[key] = value;
      return;
    }
    if (current === value || !ENV_FILE_WINS.test(key)) return;
    env[key] = value;
    warnings.push(`${key} is also set in your environment variables; the value in ${file} is used`);
  });
  return { found: true, warnings };
}
