import { existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { closeCheckpointer, isPortTaken, portTakenMessage } from './startup.ts';

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  server = undefined;
});

const listen = (handler: (body: string) => string | undefined) =>
  new Promise<number>((done) => {
    server = createServer((_request, response) => {
      const body = handler('');
      response.writeHead(body === undefined ? 404 : 200, { 'content-type': 'application/json' });
      response.end(body ?? '{}');
    });
    server.listen(0, '127.0.0.1', () => done((server?.address() as { port: number }).port));
  });

describe('startup checks', () => {
  it('tells a taken port from a free one', async () => {
    const port = await listen(() => undefined);
    expect(await isPortTaken('127.0.0.1', port)).toBe(true);
    await new Promise<void>((done) => server?.close(() => done()));
    server = undefined;
    expect(await isPortTaken('127.0.0.1', port)).toBe(false);
  });

  it('says Agent Studio already runs there, or that another program has the port', async () => {
    const studio = await listen(() => JSON.stringify({ version: '0.1.0', activeRuns: 0 }));
    expect(await portTakenMessage('127.0.0.1', studio)).toMatch(/Agent Studio is already running at http:\/\/127\.0\.0\.1:\d+/);
    await new Promise<void>((done) => server?.close(() => done()));
    const other = await listen(() => undefined);
    expect(await portTakenMessage('127.0.0.1', other)).toMatch(new RegExp(`Port ${other} is used by another program.*PORT=${other + 1}`));
  });

  it('folds the write-ahead log into the checkpoint database and closes it', async () => {
    const file = join(makeTree({}), 'checkpoints.sqlite');
    const saver = SqliteSaver.fromConnString(file);
    await saver.getTuple({ configurable: { thread_id: 't1' } });
    closeCheckpointer(saver as never);
    expect(existsSync(file)).toBe(true);
    expect(existsSync(`${file}-wal`) ? statSync(`${file}-wal`).size : 0).toBe(0);
    expect(() => closeCheckpointer(saver as never)).not.toThrow();
  });
});
