import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModelFactory, MODEL_RETRIES } from './model.ts';

const config = { baseUrl: 'http://127.0.0.1:20128/v1', apiKey: 'test-key', model: 'cc/default' };

const sse = (text: string) => {
  const chunk = (delta: object, finish: string | null = null) =>
    `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'cc/default', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  const body = `${chunk({ role: 'assistant', content: text })}${chunk({}, 'stop')}data: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
};

const failure = (status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message: `upstream ${status}`, type: 'server_error' } }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const reset = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) });

/** A fetch that plays the given answers in order (the last one repeats) and notes when each call came. */
function fakeFetch(...answers: Array<() => Response | Error>) {
  const calls: number[] = [];
  const fetch = async (): Promise<Response> => {
    calls.push(Date.now());
    const answer = (answers[calls.length - 1] ?? answers.at(-1))?.();
    if (answer instanceof Error) throw answer;
    if (!answer) throw new Error('no answer scripted');
    return answer;
  };
  return { fetch: fetch as typeof globalThis.fetch, calls, gaps: () => calls.slice(1).map((at, index) => at - (calls[index] ?? at)) };
}

/** Run the call to its end while fake time passes, so backoff waits take no real time. */
async function settle<T>(promise: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  let done = false;
  const outcome = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  void outcome.finally(() => {
    done = true;
  });
  for (let step = 0; step < 400 && !done; step += 1) await vi.advanceTimersByTimeAsync(250);
  return outcome;
}

/**
 * Stream one answer, as the agents do. (invoke would also estimate token counts with tiktoken, which
 * downloads its tables through the global fetch: not something a unit test should depend on.)
 */
async function streamed(fetch: typeof globalThis.fetch): Promise<string> {
  const chunks = await createModelFactory(config, { fetch })().stream('hi');
  let text = '';
  for await (const chunk of chunks) text += String(chunk.content);
  return text;
}

const ask = (fetch: typeof globalThis.fetch) => settle(streamed(fetch));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('model retries', () => {
  it('retries server errors with growing waits and then answers', async () => {
    const { fetch, calls, gaps } = fakeFetch(() => failure(503), () => failure(502), () => sse('Hello'));
    const { value } = await ask(fetch);
    expect(value).toBe('Hello');
    expect(calls).toHaveLength(3);
    const [first = 0, second = 0] = gaps();
    expect(first).toBeGreaterThanOrEqual(1000);
    expect(second).toBeGreaterThanOrEqual(2000);
  });

  it('retries a rate limit, waiting as long as Retry-After asks', async () => {
    const { fetch, calls, gaps } = fakeFetch(() => failure(429, { 'retry-after': '6' }), () => sse('ok'));
    const { value } = await ask(fetch);
    expect(value).toBe('ok');
    expect(calls).toHaveLength(2);
    expect(gaps()[0]).toBeGreaterThanOrEqual(6000);
  });

  it('retries a rate limit without Retry-After too', async () => {
    const { fetch, calls } = fakeFetch(() => failure(429), () => sse('ok'));
    expect((await ask(fetch)).value).toBe('ok');
    expect(calls).toHaveLength(2);
  });

  it('retries a connection reset', async () => {
    const { fetch, calls } = fakeFetch(reset, () => sse('back'));
    expect((await ask(fetch)).value).toBe('back');
    expect(calls).toHaveLength(2);
  });

  it('gives up after a few attempts with the last error', async () => {
    const { fetch, calls } = fakeFetch(() => failure(503));
    const { error } = await ask(fetch);
    expect(String(error)).toMatch(/503/);
    expect(calls).toHaveLength(MODEL_RETRIES + 1);
  });

  it('fails fast on auth and validation errors', async () => {
    for (const status of [400, 401, 403, 404]) {
      const { fetch, calls } = fakeFetch(() => failure(status));
      const { error } = await ask(fetch);
      expect(String(error)).toMatch(new RegExp(String(status)));
      expect(calls).toHaveLength(1);
    }
  });
});
