import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTree } from '../../test-utils/tree.ts';
import { createDefinitionVersions } from '../../versions/tracker.ts';
import { allowedFor } from '../guard.ts';
import { createServer, type ServerDeps } from '../server.ts';
import { registerVersionRoutes } from './versions.ts';

function setup() {
  const root = makeTree({ 'agents/scout/AGENT.md': 'scout v1', 'skills/sql-style/SKILL.md': 'style v1' });
  const versions = createDefinitionVersions({ rootDir: root, dir: join(root, 'data', 'history') });
  versions.sync('start');
  writeFileSync(join(root, 'agents', 'scout', 'AGENT.md'), 'scout v2');
  versions.sync('change');
  const app = Fastify();
  registerVersionRoutes(app, versions);
  return { app, root };
}

let close: (() => Promise<unknown>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

describe('version routes', () => {
  it('lists tracked definitions and the versions of one', async () => {
    const { app } = setup();
    close = () => app.close();

    expect((await app.inject({ url: '/api/definitions/agents' })).json()).toEqual([
      { name: 'scout', exists: true, last: expect.objectContaining({ id: 2, change: 'changed' }) },
    ]);
    const list = await app.inject({ url: '/api/definitions/agents/scout/versions' });
    expect(list.json().map((version: { id: number; change: string; size: number }) => [version.id, version.change, version.size])).toEqual([
      [2, 'changed', 8],
      [1, 'baseline', 8],
    ]);
    expect((await app.inject({ url: '/api/definitions/skills/ghost/versions' })).json()).toEqual([]);
  });

  it('reads one version with the current file next to it', async () => {
    const { app } = setup();
    close = () => app.close();

    const response = await app.inject({ url: '/api/definitions/agents/scout/versions/1' });
    expect(response.json()).toMatchObject({ id: 1, change: 'baseline', content: 'scout v1', current: 'scout v2' });
    expect(response.json()).not.toHaveProperty('hash');
    expect((await app.inject({ url: '/api/definitions/agents/scout/versions/7' })).statusCode).toBe(404);
  });

  it('restores a version to disk', async () => {
    const { app, root } = setup();
    close = () => app.close();

    const response = await app.inject({ method: 'POST', url: '/api/definitions/agents/scout/versions/1/restore' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ changed: true, version: expect.objectContaining({ id: 3, change: 'restored', restoredFrom: 1 }) });
    expect(readFileSync(join(root, 'agents', 'scout', 'AGENT.md'), 'utf8')).toBe('scout v1');

    const again = await app.inject({ method: 'POST', url: '/api/definitions/agents/scout/versions/1/restore' });
    expect(again.json()).toEqual({ changed: false });
    expect((await app.inject({ method: 'POST', url: '/api/definitions/agents/scout/versions/9/restore' })).statusCode).toBe(404);
  });

  it('rejects unknown kinds, invalid names and ids before touching the disk', async () => {
    const { app } = setup();
    close = () => app.close();
    const urls = [
      '/api/definitions/vendor',
      '/api/definitions/vendor/scout/versions',
      '/api/definitions/agents/..%2F..%2Fetc/versions',
      '/api/definitions/agents/Scout/versions/1',
      '/api/definitions/agents/scout/versions/0',
      '/api/definitions/agents/scout/versions/abc',
    ];
    for (const url of urls) {
      expect((await app.inject({ url })).statusCode, url).toBe(400);
    }
    const restore = await app.inject({ method: 'POST', url: '/api/definitions/skills/..%2Fagents/versions/1/restore' });
    expect(restore.statusCode).toBe(400);
  });

  it('refuses to restore a deletion marker', async () => {
    const root = makeTree({ 'skills/gone/SKILL.md': 'x' });
    const versions = createDefinitionVersions({ rootDir: root, dir: join(root, 'history') });
    versions.sync('start');
    rmSync(join(root, 'skills', 'gone'), { recursive: true });
    versions.sync('change');
    const app = Fastify();
    registerVersionRoutes(app, versions);
    close = () => app.close();

    const response = await app.inject({ method: 'POST', url: '/api/definitions/skills/gone/versions/2/restore' });
    expect(response.statusCode).toBe(409);
  });

  it('sits behind the Host/Origin guard of the app server', async () => {
    const root = makeTree({ 'agents/scout/AGENT.md': 'scout v1' });
    const versions = createDefinitionVersions({ rootDir: root, dir: join(root, 'history') });
    versions.sync('start');
    const app = await createServer({
      allowed: allowedFor({ port: 4800, devPort: 5173 }),
      versions,
    } as unknown as ServerDeps);
    close = () => app.close();

    const url = '/api/definitions/agents/scout/versions/1/restore';
    const foreign = await app.inject({ method: 'POST', url, headers: { host: '127.0.0.1:4800', origin: 'https://evil.example' } });
    expect(foreign.statusCode).toBe(403);
    const local = await app.inject({ url: '/api/definitions/agents/scout/versions', headers: { host: '127.0.0.1:4800' } });
    expect(local.statusCode).toBe(200);
  });
});
