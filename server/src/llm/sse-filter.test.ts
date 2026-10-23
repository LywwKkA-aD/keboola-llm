import { describe, expect, it } from 'vitest';
import { isNoopEvent, withoutNoopChunks } from './sse-filter.ts';

const chunk = (delta: object, extra: object = {}) =>
  `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', model: 'm', choices: [{ index: 0, delta, finish_reason: null }], ...extra })}`;
const keepalive = chunk({}, { id: 'chatcmpl-keepalive', model: 'keepalive' });

describe('isNoopEvent', () => {
  it.each([
    ['keepalive chunk with empty delta', keepalive, true],
    ['empty delta disguised with a real id', chunk({}), true],
    ['ping event', 'event: ping\ndata: {"type":"ping"}', true],
    ['SSE comment', ': keep-alive', true],
    ['role chunk', chunk({ role: 'assistant' }), false],
    ['content chunk', chunk({ content: 'hi' }), false],
    ['finish chunk', chunk({}).replace('"finish_reason":null', '"finish_reason":"stop"'), false],
    ['usage chunk', `data: ${JSON.stringify({ id: 'c1', choices: [], usage: { total_tokens: 3 } })}`, false],
    ['done marker', 'data: [DONE]', false],
    ['non-JSON data', 'data: hello', false],
  ])('%s -> %s', (_name, event, expected) => {
    expect(isNoopEvent(event)).toBe(expected);
  });
});

const streamOf = (parts: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      parts.forEach((part) => controller.enqueue(encoder.encode(part)));
      controller.close();
    },
  });

const fakeFetch = (body: ReadableStream<Uint8Array> | string, contentType: string) =>
  (async () => new Response(body, { status: 200, headers: { 'content-type': contentType } })) as typeof fetch;

describe('withoutNoopChunks', () => {
  it('drops no-op events from an SSE response, even when split across reads', async () => {
    const text = `${keepalive}\n\n${chunk({ role: 'assistant' })}\n\n${keepalive}\r\n\r\n${chunk({ content: 'hi' })}\n\ndata: [DONE]\n\n`;
    const parts = [text.slice(0, 17), text.slice(17, 140), text.slice(140)];
    const response = await withoutNoopChunks(fakeFetch(streamOf(parts), 'text/event-stream; charset=utf-8'))('http://x');
    const out = await response.text();

    expect(out).not.toContain('keepalive');
    expect(out).toContain('"role":"assistant"');
    expect(out).toContain('"content":"hi"');
    expect(out.trimEnd().endsWith('data: [DONE]')).toBe(true);
    expect(response.headers.get('content-type')).toMatch(/event-stream/);
  });

  it('flushes a trailing event without a final blank line', async () => {
    const response = await withoutNoopChunks(fakeFetch(streamOf([`${chunk({ content: 'x' })}`]), 'text/event-stream'))('http://x');
    expect(await response.text()).toContain('"content":"x"');
  });

  it('leaves non-SSE responses untouched', async () => {
    const response = await withoutNoopChunks(fakeFetch('{"ok":true}', 'application/json'))('http://x');
    expect(await response.json()).toEqual({ ok: true });
  });
});
