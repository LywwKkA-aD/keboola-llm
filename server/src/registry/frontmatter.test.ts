import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from './frontmatter.ts';

describe('parseFrontmatter', () => {
  it('splits YAML frontmatter from the body', () => {
    const result = parseFrontmatter('---\nname: x\ntools: [a, b]\n---\n\n# Title\nText\n');
    expect(result).toEqual({ data: { name: 'x', tools: ['a', 'b'] }, body: '# Title\nText' });
  });

  it('handles CRLF line endings and a BOM', () => {
    const result = parseFrontmatter('﻿---\r\nname: x\r\n---\r\nBody\r\n');
    expect(result).toEqual({ data: { name: 'x' }, body: 'Body' });
  });

  it('supports multi-line YAML values', () => {
    const result = parseFrontmatter('---\ndescription: |\n  line one\n  line two\n---\nB');
    expect(result.data.description).toBe('line one\nline two\n');
  });

  it('returns the whole text as body when there is no frontmatter', () => {
    expect(parseFrontmatter('# Just markdown\n')).toEqual({ data: {}, body: '# Just markdown' });
  });

  it('treats non-object YAML as empty data', () => {
    expect(parseFrontmatter('---\n- a\n- b\n---\nB').data).toEqual({});
  });

  it('throws on invalid YAML so callers can report the file', () => {
    expect(() => parseFrontmatter('---\nname: [unclosed\n---\nB')).toThrow();
  });
});
