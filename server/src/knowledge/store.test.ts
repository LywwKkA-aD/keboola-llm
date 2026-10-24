import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { createNoteStore } from './store.ts';

/** Create a symlink (a junction for folders, so Windows runners need no privilege); false when the OS refuses. */
function link(target: string, path: string, kind: 'file' | 'dir'): boolean {
  try {
    symlinkSync(target, path, kind === 'dir' ? 'junction' : 'file');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return false;
    throw error;
  }
}

function setup(files: Record<string, string> = {}) {
  const root = makeTree({ 'knowledge/.keep': '', 'outside/secret.md': '# Secret\n', ...files });
  const dir = join(root, 'knowledge');
  return { root, dir, outside: join(root, 'outside'), store: createNoteStore(dir) };
}

const status = (code: number) => expect.objectContaining({ statusCode: code });

describe('note store: list', () => {
  it('lists Markdown notes with title, size and modification time, sorted by path', async () => {
    const { dir, store } = setup({
      'knowledge/glossary.md': '# Glossary\n\nTerms.',
      'knowledge/how-to/deploy.md': 'No heading here.',
      'knowledge/data-model/sales/orders.md': '## Orders\n',
    });
    utimesSync(join(dir, 'glossary.md'), new Date('2026-10-24T10:00:00Z'), new Date('2026-10-24T10:00:00Z'));

    const notes = await store.list();
    expect(notes.map((note) => note.path)).toEqual(['data-model/sales/orders.md', 'glossary.md', 'how-to/deploy.md']);
    expect(notes[1]).toEqual({ path: 'glossary.md', title: 'Glossary', size: 18, modifiedAt: '2026-10-24T10:00:00.000Z' });
    expect(notes[2]?.title).toBe('deploy');
  });

  it('leaves out hidden entries, other file types and names the API could not address', async () => {
    const { store } = setup({
      'knowledge/.draft.md': '# Hidden',
      'knowledge/.git/notes.md': '# Hidden folder',
      'knowledge/table.csv': 'a,b',
      'knowledge/readme.txt': 'text',
      'knowledge/con.md': '# Reserved name',
      'knowledge/ok.md': '# Ok',
    });
    expect((await store.list()).map((note) => note.path)).toEqual(['ok.md']);
  });

  it('does not follow links out of the folder', async ({ skip }) => {
    const { dir, outside, store } = setup({ 'knowledge/ok.md': '# Ok' });
    if (!link(outside, join(dir, 'linked-folder'), 'dir')) skip();
    link(join(outside, 'secret.md'), join(dir, 'linked.md'), 'file');
    expect((await store.list()).map((note) => note.path)).toEqual(['ok.md']);
  });

  it('is empty when the folder does not exist yet', async () => {
    const root = makeTree({});
    expect(await createNoteStore(join(root, 'missing')).list()).toEqual([]);
  });
});

describe('note store: read', () => {
  it('reads a note', async () => {
    const { store } = setup({ 'knowledge/how-to/deploy.md': '# Deploy\nSteps.' });
    expect(await store.read('how-to/deploy.md')).toMatchObject({ path: 'how-to/deploy.md', title: 'Deploy', content: '# Deploy\nSteps.', size: 15 });
  });

  it('answers 404 for missing notes and folders named like notes', async () => {
    const { dir, store } = setup();
    mkdirSync(join(dir, 'folder.md'));
    await expect(store.read('nope.md')).rejects.toThrow(status(404));
    await expect(store.read('folder.md')).rejects.toThrow(status(404));
  });

  it('refuses paths that try to leave the folder', async () => {
    const { store } = setup();
    for (const path of ['../outside/secret.md', 'a/../../outside/secret.md', '/etc/passwd.md', '..\\outside\\secret.md', 'C:/x.md', '.hidden.md']) {
      await expect(store.read(path), path).rejects.toThrow(status(400));
    }
  });

  it('refuses to read through a linked folder or a linked file', async ({ skip }) => {
    const { dir, outside, store } = setup();
    if (!link(outside, join(dir, 'linked'), 'dir')) skip();
    await expect(store.read('linked/secret.md')).rejects.toThrow(status(400));
    if (link(join(outside, 'secret.md'), join(dir, 'file.md'), 'file')) {
      await expect(store.read('file.md')).rejects.toThrow(status(400));
    }
  });

  it('allows the knowledge folder itself to sit behind a link', async ({ skip }) => {
    // The folder may live behind a link (e.g. /tmp on macOS); only what is inside it is checked.
    const { root, dir } = setup({ 'knowledge/ok.md': '# Ok' });
    if (!link(dir, join(root, 'alias'), 'dir')) skip();
    expect((await createNoteStore(join(root, 'alias')).read('ok.md')).content).toBe('# Ok');
  });
});

describe('note store: write', () => {
  it('creates folders and returns the summary', async () => {
    const { dir, store } = setup();
    const summary = await store.write('decisions/2026-10-24-naming.md', '# Naming\n');
    expect(summary).toMatchObject({ path: 'decisions/2026-10-24-naming.md', title: 'Naming', size: 9 });
    expect(readFileSync(join(dir, 'decisions', '2026-10-24-naming.md'), 'utf8')).toBe('# Naming\n');
  });

  it('replaces a note without leaving temporary files behind', async () => {
    const { dir, store } = setup({ 'knowledge/glossary.md': '# Old' });
    await store.write('glossary.md', '# New');
    expect(readFileSync(join(dir, 'glossary.md'), 'utf8')).toBe('# New');
    expect(readdirSync(dir).toSorted()).toEqual(['.keep', 'glossary.md']);
  });

  it('only creates when asked to, never overwriting', async () => {
    const { dir, store } = setup({ 'knowledge/glossary.md': '# Old' });
    await expect(store.write('glossary.md', '# New', { create: true })).rejects.toThrow(status(409));
    expect(readFileSync(join(dir, 'glossary.md'), 'utf8')).toBe('# Old');
    await store.write('new.md', '# New', { create: true });
    expect(existsSync(join(dir, 'new.md'))).toBe(true);
  });

  it('enforces the size limit in bytes', async () => {
    const root = makeTree({});
    const store = createNoteStore(join(root, 'notes'), { maxBytes: 10 });
    await expect(store.write('a.md', 'ж'.repeat(6))).rejects.toThrow(status(413));
    expect((await store.write('a.md', 'ж'.repeat(5))).size).toBe(10);
  });

  it('refuses unsafe paths and writes nothing outside', async () => {
    const { outside, store } = setup();
    for (const path of ['../outside/new.md', '../../new.md', '/tmp/new.md', 'a\\..\\..\\new.md', 'notes.txt', '.git/hooks.md']) {
      await expect(store.write(path, '# x'), path).rejects.toThrow(status(400));
    }
    expect(readdirSync(outside)).toEqual(['secret.md']);
  });

  it('refuses to write through links', async ({ skip }) => {
    const { dir, outside, store } = setup();
    if (!link(outside, join(dir, 'linked'), 'dir')) skip();
    await expect(store.write('linked/new.md', '# x')).rejects.toThrow(status(400));
    await expect(store.write('linked/secret.md', '# x')).rejects.toThrow(status(400));
    if (link(join(outside, 'secret.md'), join(dir, 'file.md'), 'file')) {
      await expect(store.write('file.md', '# x')).rejects.toThrow(status(400));
    }
    expect(readdirSync(outside)).toEqual(['secret.md']);
    expect(readFileSync(join(outside, 'secret.md'), 'utf8')).toBe('# Secret\n');
  });

  it('explains when a file stands where a folder should be', async () => {
    const { store } = setup({ 'knowledge/how-to': 'a file' });
    await expect(store.write('how-to/deploy.md', '# x')).rejects.toThrow(status(400));
  });
});

describe('note store: remove', () => {
  it('deletes a note and the folders it leaves empty', async () => {
    const { dir, store } = setup({ 'knowledge/how-to/deploy/prod.md': '# Prod', 'knowledge/glossary.md': '# G' });
    await store.remove('how-to/deploy/prod.md');
    expect(existsSync(join(dir, 'how-to'))).toBe(false);
    expect(existsSync(dir)).toBe(true);
    expect((await store.list()).map((note) => note.path)).toEqual(['glossary.md']);
  });

  it('keeps folders that still hold something', async () => {
    const { dir, store } = setup({ 'knowledge/how-to/a.md': '# A', 'knowledge/how-to/b.md': '# B' });
    await store.remove('how-to/a.md');
    expect(readdirSync(join(dir, 'how-to'))).toEqual(['b.md']);
  });

  it('answers 404 for missing notes and 400 for unsafe paths or links', async ({ skip }) => {
    const { dir, outside, store } = setup();
    await expect(store.remove('nope.md')).rejects.toThrow(status(404));
    await expect(store.remove('../outside/secret.md')).rejects.toThrow(status(400));
    if (!link(outside, join(dir, 'linked'), 'dir')) skip();
    await expect(store.remove('linked/secret.md')).rejects.toThrow(status(400));
    expect(existsSync(join(outside, 'secret.md'))).toBe(true);
  });
});

describe('note store: messages', () => {
  it('never puts absolute paths into error messages', async () => {
    const { dir, store } = setup();
    writeFileSync(join(dir, 'how-to'), 'file');
    const errors = await Promise.all([store.read('nope.md'), store.write('how-to/x.md', '# x'), store.remove('nope.md')].map((promise) => promise.catch((error: Error) => error.message)));
    errors.forEach((message) => expect(message).not.toContain(dir));
  });
});
