import { describe, expect, it } from 'vitest';
import { parseFolder, parseNotePath, uploadPath, uploadTitle } from './note-path.ts';

const rejects = (raw: unknown) => {
  expect(() => parseNotePath(raw), String(raw)).toThrow(expect.objectContaining({ statusCode: 400 }));
};

describe('parseNotePath', () => {
  it('accepts relative Markdown paths and normalizes them', () => {
    expect(parseNotePath('glossary.md')).toBe('glossary.md');
    expect(parseNotePath('how-to/load-orders.md')).toBe('how-to/load-orders.md');
    expect(parseNotePath('./data-model//sales.md')).toBe('data-model/sales.md');
    expect(parseNotePath('decisions/2026-10-24-naming (v2).md')).toBe('decisions/2026-10-24-naming (v2).md');
    expect(parseNotePath('словарь/заказы.md')).toBe('словарь/заказы.md');
    expect(parseNotePath('AGENTS.md')).toBe('AGENTS.md');
    // Composed and decomposed accents name the same note.
    expect(parseNotePath('poznámky.md'.normalize('NFD'))).toBe('poznámky.md'.normalize('NFC'));
  });

  it('rejects parent segments however they are written', () => {
    ['../secret.md', '..', 'a/../b.md', 'a/../../b.md', 'how-to/..', '../../etc/passwd.md', './../x.md'].forEach(rejects);
  });

  it('rejects absolute paths, drive letters and UNC shares', () => {
    ['/etc/passwd.md', '/knowledge/a.md', 'C:/Windows/a.md', 'c:a.md', 'C:\\x.md', '//server/share/a.md'].forEach(rejects);
  });

  it('rejects backslashes even when they would only separate folders', () => {
    ['how-to\\a.md', '..\\secret.md', 'a\\..\\..\\b.md'].forEach(rejects);
  });

  it('rejects hidden segments, temp files and the empty path', () => {
    ['.secret.md', '.git/config.md', 'a/.hidden/b.md', '.md', '', '.', './', 'a/'].forEach(rejects);
  });

  it('only accepts .md files', () => {
    ['notes.txt', 'notes', 'notes.MD.exe', 'notes.md.bak', 'folder/notes.markdown', 'a.md/'].forEach(rejects);
  });

  it('rejects names Windows cannot store or would alias', () => {
    ['a:b.md', 'note.md:stream', 'a*.md', 'a?.md', 'a|b.md', 'a<b>.md', 'a"b.md', 'con.md', 'NUL.md', 'lpt1.md', 'folder./a.md', 'folder /a.md', ' lead.md'].forEach(
      rejects,
    );
  });

  it('rejects control characters, non-strings and oversized paths', () => {
    ['a\u0000.md', 'a\nb.md', 'a\tb.md', 'a\u007f.md'].forEach(rejects);
    [undefined, null, 42, ['a.md'], { path: 'a.md' }].forEach(rejects);
    rejects(`${'a'.repeat(300)}.md`);
    rejects(`${'deep/'.repeat(8)}note.md`);
  });
});

describe('parseFolder', () => {
  it('accepts the top level and nested folders', () => {
    expect(parseFolder('')).toBe('');
    expect(parseFolder(undefined)).toBe('');
    expect(parseFolder('how-to')).toBe('how-to');
    expect(parseFolder('data-model/sales/')).toBe('data-model/sales');
  });

  it('applies the same rules as note paths', () => {
    ['..', '../x', '/abs', 'C:', 'a\\b', '.hidden', 'con'].forEach((raw) => {
      expect(() => parseFolder(raw), raw).toThrow(expect.objectContaining({ statusCode: 400 }));
    });
  });
});

describe('uploadPath', () => {
  it('turns a file name into a readable .md note path', () => {
    expect(uploadPath('Customer Glossary (v2).txt')).toBe('customer-glossary-(v2).md');
    expect(uploadPath('how-to.MD', 'how-to')).toBe('how-to/how-to.md');
    expect(uploadPath('Заказы и клиенты.md')).toBe('заказы-и-клиенты.md');
  });

  it('drops any directories in the name and characters a path may not hold', () => {
    expect(uploadPath('../../etc/passwd.md')).toBe('passwd.md');
    expect(uploadPath('C:\\Users\\me\\notes.txt')).toBe('notes.md');
    expect(uploadPath('.hidden.md')).toBe('hidden.md');
    expect(uploadPath('a:b*c?.txt')).toBe('a-b-c.md');
    expect(uploadPath('con.txt')).toBe('note-con.md');
    expect(uploadPath('***.md')).toBe('note.md');
  });

  it('only takes .md and .txt files', () => {
    ['notes.pdf', 'notes', 'notes.md.exe', 'archive.zip'].forEach((name) => {
      expect(() => uploadPath(name), name).toThrow(expect.objectContaining({ statusCode: 400 }));
    });
  });

  it('rejects an unsafe target folder', () => {
    expect(() => uploadPath('a.md', '../outside')).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('uploadTitle', () => {
  it('keeps the original file name as typed, without folders and extension', () => {
    expect(uploadTitle('C:\\Users\\me\\Deploy steps (v2).txt')).toBe('Deploy steps (v2)');
    expect(uploadTitle('Заказы.TXT')).toBe('Заказы');
    expect(uploadTitle('.txt')).toBe('Note');
  });
});
