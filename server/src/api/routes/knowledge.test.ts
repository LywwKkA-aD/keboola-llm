import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createNoteStore } from '../../knowledge/store.ts';
import { TEST_HOST, testDeps } from '../../test-utils/server-deps.ts';
import { makeTree } from '../../test-utils/tree.ts';
import { createServer } from '../server.ts';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function setup(files: Record<string, string> = {}) {
  const root = makeTree({ 'knowledge/glossary.md': '# Glossary\n\nTerms.', 'outside/secret.md': '# Secret', ...files });
  const dir = join(root, 'knowledge');
  app = await createServer(testDeps({ knowledge: createNoteStore(dir) }));
  const send = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app!.inject({ method, url, headers: TEST_HOST, ...(payload === undefined ? {} : { payload: payload as object }) });
  return { root, dir, send };
}

const noteUrl = (path: string) => `/api/knowledge/note?path=${encodeURIComponent(path)}`;

describe('knowledge routes', () => {
  it('lists notes with their titles', async () => {
    const { send } = await setup({ 'knowledge/how-to/deploy.md': '# Deploy' });
    const response = await send('GET', '/api/knowledge');
    expect(response.statusCode).toBe(200);
    expect(response.json().notes).toEqual([
      expect.objectContaining({ path: 'glossary.md', title: 'Glossary', size: 18 }),
      expect.objectContaining({ path: 'how-to/deploy.md', title: 'Deploy' }),
    ]);
  });

  it('reads one note', async () => {
    const { send } = await setup();
    const response = await send('GET', noteUrl('glossary.md'));
    expect(response.json()).toMatchObject({ path: 'glossary.md', title: 'Glossary', content: '# Glossary\n\nTerms.' });
    expect((await send('GET', noteUrl('missing.md'))).statusCode).toBe(404);
    expect((await send('GET', '/api/knowledge/note')).statusCode).toBe(400);
  });

  it('creates a note once, then updates it', async () => {
    const { dir, send } = await setup();
    const created = await send('POST', '/api/knowledge/note', { path: 'decisions/2026-10-24-naming.md', content: '# Naming\r\n' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ path: 'decisions/2026-10-24-naming.md', title: 'Naming' });
    expect(readFileSync(join(dir, 'decisions', '2026-10-24-naming.md'), 'utf8')).toBe('# Naming\n');

    const again = await send('POST', '/api/knowledge/note', { path: 'decisions/2026-10-24-naming.md', content: '# Other' });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'A note named "decisions/2026-10-24-naming.md" already exists' });

    const updated = await send('PUT', '/api/knowledge/note', { path: 'decisions/2026-10-24-naming.md', content: '# Naming rules' });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().title).toBe('Naming rules');
  });

  it('refuses a save based on an older version of the note', async () => {
    const { dir, send } = await setup();
    const { modifiedAt } = (await send('GET', noteUrl('glossary.md'))).json() as { modifiedAt: string };
    const stale = new Date(Date.parse(modifiedAt) - 60_000).toISOString();
    expect((await send('PUT', '/api/knowledge/note', { path: 'glossary.md', content: '# Mine', expectedModifiedAt: stale })).statusCode).toBe(409);
    expect(readFileSync(join(dir, 'glossary.md'), 'utf8')).toBe('# Glossary\n\nTerms.');
    expect((await send('PUT', '/api/knowledge/note', { path: 'glossary.md', content: '# Mine', expectedModifiedAt: modifiedAt })).statusCode).toBe(200);
  });

  it('deletes a note', async () => {
    const { dir, send } = await setup();
    expect((await send('DELETE', noteUrl('glossary.md'))).statusCode).toBe(204);
    expect(existsSync(join(dir, 'glossary.md'))).toBe(false);
    expect((await send('DELETE', noteUrl('glossary.md'))).statusCode).toBe(404);
  });

  it('validates bodies', async () => {
    const { send } = await setup();
    expect((await send('PUT', '/api/knowledge/note', { path: 'a.md' })).statusCode).toBe(400);
    expect((await send('PUT', '/api/knowledge/note', { path: 'a.md', content: 1 })).statusCode).toBe(400);
    expect((await send('PUT', '/api/knowledge/note', { path: 'a.md', content: '', extra: true })).statusCode).toBe(400);
  });

  it('refuses notes over the size limit', async () => {
    const { send } = await setup();
    const response = await send('PUT', '/api/knowledge/note', { path: 'big.md', content: 'x'.repeat(256 * 1024 + 1) });
    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: 'The note is larger than 256 KB' });
  });

  it('turns every traversal attempt away with 400 and touches nothing outside', async () => {
    const { root, send } = await setup();
    const attempts = [
      '../outside/secret.md',
      'how-to/../../outside/secret.md',
      '..\\outside\\secret.md',
      '/etc/passwd.md',
      `${root}/outside/secret.md`,
      'C:/Windows/win.md',
      'C:\\Windows\\win.md',
      '//server/share/a.md',
      '.git/config.md',
      'glossary.md:hidden',
      'glossary.md\u0000.md',
    ];
    for (const path of attempts) {
      expect((await send('GET', noteUrl(path))).statusCode, `GET ${path}`).toBe(400);
      expect((await send('PUT', '/api/knowledge/note', { path, content: '# pwned' })).statusCode, `PUT ${path}`).toBe(400);
      expect((await send('DELETE', noteUrl(path))).statusCode, `DELETE ${path}`).toBe(400);
    }
    // Encoded by hand rather than by encodeURIComponent: the server decodes the query itself.
    expect((await send('GET', '/api/knowledge/note?path=%2e%2e%2foutside%2fsecret.md')).statusCode).toBe(400);
    expect((await send('GET', '/api/knowledge/note?path=..%5Coutside%5Csecret.md')).statusCode).toBe(400);
    expect(readdirSync(join(root, 'outside'))).toEqual(['secret.md']);
    expect(readFileSync(join(root, 'outside', 'secret.md'), 'utf8')).toBe('# Secret');
  });

  it('never answers with absolute paths', async () => {
    const { root, send } = await setup({ 'knowledge/how-to': 'a file, not a folder' });
    const responses = await Promise.all([
      send('GET', noteUrl('missing.md')),
      send('PUT', '/api/knowledge/note', { path: 'how-to/x.md', content: '# x' }),
      send('GET', noteUrl('../outside/secret.md')),
    ]);
    responses.forEach((response) => expect(response.body).not.toContain(root));
  });

  it('sits behind the Host/Origin guard', async () => {
    const { send } = await setup();
    expect((await send('GET', '/api/knowledge')).statusCode).toBe(200);
    const foreign = await app!.inject({ method: 'PUT', url: '/api/knowledge/note', headers: { ...TEST_HOST, origin: 'https://evil.example' }, payload: { path: 'a.md', content: 'x' } });
    expect(foreign.statusCode).toBe(403);
  });
});

describe('knowledge upload', () => {
  it('stores a .md file under a safe name', async () => {
    const { dir, send } = await setup();
    const response = await send('POST', '/api/knowledge/upload', { name: 'Sales Data Model.md', content: '\uFEFF# Sales\r\n\r\nOrders.' });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ path: 'sales-data-model.md', title: 'Sales' });
    expect(readFileSync(join(dir, 'sales-data-model.md'), 'utf8')).toBe('# Sales\n\nOrders.');
  });

  it('converts a .txt file to a titled Markdown note in the chosen folder', async () => {
    const { dir, send } = await setup();
    const response = await send('POST', '/api/knowledge/upload', { name: 'Deploy steps.txt', content: 'Build.\nShip.', folder: 'how-to' });
    expect(response.json()).toMatchObject({ path: 'how-to/deploy-steps.md', title: 'Deploy steps' });
    expect(readFileSync(join(dir, 'how-to', 'deploy-steps.md'), 'utf8')).toBe('# Deploy steps\n\nBuild.\nShip.\n');
  });

  it('never overwrites, and only takes .md and .txt into safe folders', async () => {
    const { root, send } = await setup();
    expect((await send('POST', '/api/knowledge/upload', { name: 'glossary.md', content: '# New' })).statusCode).toBe(409);
    expect((await send('POST', '/api/knowledge/upload', { name: 'report.pdf', content: '%PDF' })).statusCode).toBe(400);
    expect((await send('POST', '/api/knowledge/upload', { name: 'a.md', content: '# a', folder: '../outside' })).statusCode).toBe(400);
    expect((await send('POST', '/api/knowledge/upload', { name: '../../outside/b.md', content: '# b' })).json()).toMatchObject({ path: 'b.md' });
    expect(readdirSync(join(root, 'outside'))).toEqual(['secret.md']);
  });
});
