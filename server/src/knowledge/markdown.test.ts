import { describe, expect, it } from 'vitest';
import { cleanText, textToMarkdown, titleOf } from './markdown.ts';

describe('titleOf', () => {
  it('takes the first heading of any level', () => {
    expect(titleOf('# Glossary\n\nTerms.', 'x')).toBe('Glossary');
    expect(titleOf('Intro line\n\n## Orders table ##\n# Later', 'x')).toBe('Orders table');
    expect(titleOf('#   Spaced   \n', 'x')).toBe('Spaced');
  });

  it('skips front matter and fenced code', () => {
    expect(titleOf('---\ntitle: meta\n---\n# Real title', 'x')).toBe('Real title');
    expect(titleOf('```sh\n# not a heading\n```\n# Deploy', 'x')).toBe('Deploy');
    expect(titleOf('~~~\n# not a heading\n~~~', 'fallback')).toBe('fallback');
  });

  it('falls back when there is no heading', () => {
    expect(titleOf('', 'sales')).toBe('sales');
    expect(titleOf('#hashtag only\nplain', 'sales')).toBe('sales');
    expect(titleOf('#\n', 'sales')).toBe('sales');
  });
});

describe('cleanText', () => {
  it('drops a byte order mark and uses LF line endings', () => {
    expect(cleanText('﻿# A\r\nB\rC\n')).toBe('# A\nB\nC\n');
  });
});

describe('textToMarkdown', () => {
  it('gives plain text a heading from the file name', () => {
    expect(textToMarkdown('Customer glossary', 'Orders: one row per order.\r\nCustomers: one per customer.\r\n')).toBe(
      '# Customer glossary\n\nOrders: one row per order.\nCustomers: one per customer.\n',
    );
  });

  it('keeps a heading the text already has', () => {
    expect(textToMarkdown('notes', '\n# Own title\nBody')).toBe('# Own title\nBody\n');
  });

  it('turns an empty file into a note with just the heading', () => {
    expect(textToMarkdown('empty', '  \n')).toBe('# empty\n');
  });
});
