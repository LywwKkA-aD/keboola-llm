import { parse } from 'yaml';

export interface Frontmatter {
  readonly data: Readonly<Record<string, unknown>>;
  readonly body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Split a Markdown file into YAML frontmatter and body. Throws on invalid YAML. */
export function parseFrontmatter(text: string): Frontmatter {
  const source = text.replace(/^﻿/, '');
  const match = FRONTMATTER_RE.exec(source);
  if (!match) return { data: {}, body: source.trim() };

  const parsed: unknown = parse(match[1] ?? '');
  return {
    data: isRecord(parsed) ? parsed : {},
    body: source.slice(match[0].length).trim(),
  };
}
