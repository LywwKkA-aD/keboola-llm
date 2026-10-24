/**
 * A tiny OpenAI-compatible LLM for the end-to-end tests (node:http, no dependencies).
 *   GET  /v1/models            the one stub model
 *   POST /v1/chat/completions  scripted replies (see scenarios.mjs), streamed as SSE or plain JSON
 * Run on its own with `node e2e/stub-llm/server.mjs [port]`.
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { brokenChunks, completion, streamChunks } from './chunks.mjs';
import { MODEL_ID, planReply, readTurn } from './scenarios.mjs';

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

async function readJson(request) {
  const parts = [];
  for await (const part of request) parts.push(part);
  return JSON.parse(Buffer.concat(parts).toString('utf8') || '{}');
}

/** Whether this request is the first try of a fail-once question; remembers it in `failed`. */
function breaksOff(reply, body, failed) {
  const { ask } = readTurn(body.messages);
  if (!reply.failOnce || failed.has(ask)) return false;
  failed.add(ask);
  return true;
}

async function answer(request, response, { chunkDelayMs, failed }) {
  const body = await readJson(request);
  const reply = planReply(body);
  const meta = { id: `chatcmpl-${randomUUID().slice(0, 8)}`, model: body.model ?? MODEL_ID, created: Math.floor(Date.now() / 1000) };
  if (!body.stream) {
    json(response, 200, completion(reply, meta));
    return;
  }
  const broken = breaksOff(reply, body, failed);
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  for (const chunk of broken ? brokenChunks(reply, meta) : streamChunks(reply, meta)) {
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
    if (chunkDelayMs > 0) await delay(chunkDelayMs);
  }
  response.end(broken ? '' : 'data: [DONE]\n\n');
}

/** Start the stub; port 0 picks a free one. Resolves to its /v1 base URL and a close function. */
export async function startStubLlm({ port = 0, host = '127.0.0.1', chunkDelayMs = 5 } = {}) {
  // Fail-once questions already answered with a broken stream, for the life of this stub.
  const failed = new Set();
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://stub').pathname;
    if (!request.headers.authorization?.startsWith('Bearer ')) return json(response, 401, { error: { message: 'missing API key' } });
    if (request.method === 'GET' && path === '/v1/models') {
      return json(response, 200, { object: 'list', data: [{ id: MODEL_ID, object: 'model', owned_by: 'e2e' }] });
    }
    if (request.method === 'POST' && path === '/v1/chat/completions') {
      return void answer(request, response, { chunkDelayMs, failed }).catch((error) => {
        if (!response.headersSent) json(response, 400, { error: { message: String(error) } });
        else response.destroy(error);
      });
    }
    return json(response, 404, { error: { message: `no route ${request.method} ${path}` } });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const { port: actual } = server.address();
  return {
    url: `http://${host}:${actual}/v1`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const stub = await startStubLlm({ port: Number(process.argv[2] ?? 0) });
  console.log(`Stub LLM on ${stub.url} (model ${MODEL_ID})`);
}
