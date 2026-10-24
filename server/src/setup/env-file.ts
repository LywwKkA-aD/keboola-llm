/**
 * Set KEY=value pairs in a .env file the way a careful person would by hand: the value changes in place,
 * every other line, comment and the line endings stay as they were, a missing key goes at the end.
 * The values written here are secrets (the OmniRoute key), so they never appear in an error message.
 */
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const BOM = '﻿';
const ASSIGNMENT = /^(\s*(?:export\s+)?)([\w.-]+)(\s*=\s*)(.*)$/;
const QUOTES = new Set(['"', "'", '`']);
const PLAIN = /^[\w.:/@+,~%=-]*$/;

interface Line {
  readonly text: string;
  readonly ending: string;
}

function splitLines(text: string): Line[] {
  return text
    .split(/(?<=\n)/)
    .filter((piece) => piece !== '')
    .map((piece) => {
      const ending = piece.endsWith('\r\n') ? '\r\n' : piece.endsWith('\n') ? '\n' : '';
      return { text: piece.slice(0, piece.length - ending.length), ending };
    });
}

/** The value as dotenv would see it ends where its quotes close; what follows on the line is a comment. */
function trailingComment(raw: string): { readonly comment: string; readonly closed: boolean } {
  const quote = raw[0];
  if (quote && QUOTES.has(quote)) {
    const close = raw.indexOf(quote, 1);
    return close < 0 ? { comment: '', closed: false } : { comment: raw.slice(close + 1).match(/\s+#.*$/)?.[0] ?? '', closed: true };
  }
  return { comment: raw.match(/\s+#.*$/)?.[0] ?? '', closed: true };
}

/** A value dotenv reads back unchanged: plain when safe, otherwise quoted. Throws on what no quoting keeps. */
export function formatEnvValue(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error('A .env value cannot contain line breaks');
  if (PLAIN.test(value)) return value;
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"') && !value.includes('\\')) return `"${value}"`;
  throw new Error('A .env value cannot contain both quote characters');
}

/** Return `text` with each of `values` set; nothing else in the text changes. */
export function setEnvValues(text: string, values: Readonly<Record<string, string>>): string {
  const bom = text.startsWith(BOM) ? BOM : '';
  const lines = splitLines(text.slice(bom.length));
  const eol = lines.some((line) => line.ending === '\r\n') ? '\r\n' : '\n';
  const formatted = new Map(Object.entries(values).map(([key, value]) => [key, formatEnvValue(value)]));
  const seen = new Set<string>();
  const out: string[] = [];
  // Inside a quoted value that spans lines, until the line that closes it.
  let openQuote: string | undefined;
  let dropping = false;

  lines.forEach(({ text: line, ending }) => {
    if (openQuote) {
      if (line.includes(openQuote)) openQuote = undefined;
      if (!dropping) out.push(line + ending);
      return;
    }
    dropping = false;
    const match = ASSIGNMENT.exec(line);
    if (!match) {
      out.push(line + ending);
      return;
    }
    const [, prefix = '', key = '', , raw = ''] = match;
    const { comment, closed } = trailingComment(raw);
    if (!closed) openQuote = raw[0];
    const value = formatted.get(key);
    if (value === undefined) {
      out.push(line + ending);
      return;
    }
    seen.add(key);
    dropping = !closed;
    out.push(`${prefix}${key}=${value}${comment}${ending || (dropping ? eol : '')}`);
  });

  const missing = [...formatted].filter(([key]) => !seen.has(key)).map(([key, value]) => `${key}=${value}${eol}`);
  const body = out.join('');
  const glue = missing.length > 0 && body !== '' && !body.endsWith('\n') ? eol : '';
  return bom + body + glue + missing.join('');
}

/**
 * Set `values` in the .env file at `file` atomically (a temp file renamed over it). A missing file starts
 * from `template` (.env.example) and is readable by its owner only; an existing one keeps its mode.
 */
export function writeEnvValues(file: string, values: Readonly<Record<string, string>>, { template }: { template?: string } = {}): void {
  const exists = existsSync(file);
  // Write through a symlinked .env instead of replacing the link with a plain file.
  const target = exists ? realpathSync(file) : file;
  const source = exists ? target : template !== undefined && existsSync(template) ? template : undefined;
  const current = source === undefined ? '' : readFileSync(source, 'utf8');
  const next = setEnvValues(current, values);
  const mode = exists ? statSync(target).mode & 0o777 : 0o600;
  const temp = join(dirname(target), `.${basename(target)}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`);
  try {
    writeFileSync(temp, next, { mode, flag: 'wx' });
    // The umask may have narrowed the mode; the new file gets exactly the old one.
    chmodSync(temp, mode);
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}
