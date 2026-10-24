import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createNoteStore, MAX_MEMORY_BYTES } from '../../knowledge/store.ts';
import { TEST_HOST, testDeps } from '../../test-utils/server-deps.ts';
import { makeTree } from '../../test-utils/tree.ts';
import { createServer } from '../server.ts';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function setup(files: Record<string, string> = { 'AGENTS.md': '# Shared memory\n\n- Backend is BigQuery\n' }) {
  const dir = makeTree(files);
  app = await createServer(testDeps({ memories: createNoteStore(dir, { maxBytes: MAX_MEMORY_BYTES }) }));
  const send = (method: 'GET' | 'PUT', url: string, payload?: object) =>
    app!.inject({ method, url, headers: TEST_HOST, ...(payload === undefined ? {} : { payload }) });
  return { dir, send };
}

describe('memory routes', () => {
  it('reads the shared memory with its modification time', async () => {
    const { send } = await setup();
    const response = await send('GET', '/api/memory');
    expect(response.json()).toEqual({ content: '# Shared memory\n\n- Backend is BigQuery\n', modifiedAt: expect.any(String) });
  });

  it('answers empty content before the memory file exists', async () => {
    const { send } = await setup({});
    expect((await send('GET', '/api/memory')).json()).toEqual({ content: '' });
  });

  it('saves the shared memory', async () => {
    const { dir, send } = await setup();
    const response = await send('PUT', '/api/memory', { content: '# Shared memory\r\n\r\n- Prefer CTEs\r\n' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ content: '# Shared memory\n\n- Prefer CTEs\n', modifiedAt: expect.any(String) });
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toBe('# Shared memory\n\n- Prefer CTEs\n');
  });

  it('refuses to overwrite memory an agent changed while the user was editing it', async () => {
    const { dir, send } = await setup();
    const opened = (await send('GET', '/api/memory')).json().modifiedAt as string;
    const stale = new Date(Date.parse(opened) - 60_000).toISOString();
    const conflict = await send('PUT', '/api/memory', { content: '# Mine', expectedModifiedAt: stale });
    expect(conflict.statusCode).toBe(409);
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toBe('# Shared memory\n\n- Backend is BigQuery\n');
    expect((await send('PUT', '/api/memory', { content: '# Mine', expectedModifiedAt: opened })).statusCode).toBe(200);
  });

  it('validates the body and keeps the memory small enough for every prompt', async () => {
    const { dir, send } = await setup();
    expect((await send('PUT', '/api/memory', { text: 'x' })).statusCode).toBe(400);
    expect((await send('PUT', '/api/memory', { content: 'x', path: '../x.md' })).statusCode).toBe(400);
    const big = await send('PUT', '/api/memory', { content: 'x'.repeat(MAX_MEMORY_BYTES + 1) });
    expect(big.statusCode).toBe(413);
    expect(big.json()).toEqual({ error: 'The note is larger than 64 KB' });
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toContain('BigQuery');
  });

  it('lists and reads project profiles, read-only', async () => {
    const { send } = await setup({
      'AGENTS.md': '# Shared memory',
      'projects/sandbox.md': '# Project sandbox\n\nBigQuery backend.',
      'projects/prod-eu.md': '# Project prod-eu',
      'projects/nested/other.md': '# Not a profile',
      'notes.md': '# Not a profile either',
    });
    const list = await send('GET', '/api/memory/projects');
    expect(list.json().profiles).toEqual([
      expect.objectContaining({ path: 'prod-eu.md', title: 'Project prod-eu' }),
      expect.objectContaining({ path: 'sandbox.md', title: 'Project sandbox' }),
    ]);

    const profile = await send('GET', '/api/memory/projects/sandbox.md');
    expect(profile.json()).toMatchObject({ path: 'sandbox.md', title: 'Project sandbox', content: '# Project sandbox\n\nBigQuery backend.' });
    expect((await send('GET', '/api/memory/projects/missing.md')).statusCode).toBe(404);
    expect((await send('PUT', '/api/memory/projects/sandbox.md', { content: 'x' })).statusCode).toBe(404);
  });

  it('keeps profile reads inside the projects folder', async () => {
    const { send } = await setup({ 'AGENTS.md': '# Shared memory', 'projects/sandbox.md': '# Sandbox', 'secret.md': '# Secret' });
    for (const file of ['..%2Fsecret.md', '%2e%2e%2fsecret.md', '..%5Csecret.md', 'nested%2Fx.md', '.hidden.md', 'sandbox.txt']) {
      const response = await send('GET', `/api/memory/projects/${file}`);
      expect(response.statusCode, file).toBe(400);
      expect(response.body).not.toContain('Secret');
    }
    expect((await send('GET', '/api/memory/projects/../secret.md')).body).not.toContain('# Secret');
  });

  it('is empty without project profiles', async () => {
    const { send } = await setup({});
    expect((await send('GET', '/api/memory/projects')).json()).toEqual({ profiles: [] });
  });
});
