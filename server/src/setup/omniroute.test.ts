import { describe, expect, it, vi } from 'vitest';
import { probeOmniRoute, redactSecret, testModel } from './omniroute.ts';

const KEY = 'sk-omni-0123456789abcdef';
const CONFIG = { baseUrl: 'http://omni/v1', apiKey: KEY, model: 'cc/model' };

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const fetchReturning = (response: () => Response | Promise<Response>) => vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response());
const refused = () => {
  throw new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:20128'), { code: 'ECONNREFUSED' }) });
};

describe('redactSecret', () => {
  it('blanks the key, bearer tokens and key-like strings', () => {
    const text = `bad key ${KEY}; header Bearer abc.def; provider said sk-proj-ABCDEFGH1234`;
    const redacted = redactSecret(text, KEY);
    expect(redacted).not.toContain(KEY);
    expect(redacted).not.toContain('abc.def');
    expect(redacted).not.toContain('sk-proj-ABCDEFGH1234');
    expect(redacted).toContain('[redacted]');
  });

  it('keeps ordinary text and works without a key', () => {
    expect(redactSecret('model cc/model not found', '')).toBe('model cc/model not found');
  });
});

describe('probeOmniRoute', () => {
  it('lists the models with the server key', async () => {
    const fetchImpl = fetchReturning(() => json({ data: [{ id: 'b', owned_by: 'claude' }, { id: 'a' }, { nope: 1 }] }));
    expect(await probeOmniRoute(CONFIG, fetchImpl as unknown as typeof fetch)).toEqual({
      reachable: true,
      status: 200,
      models: [
        { id: 'a', provider: '' },
        { id: 'b', provider: 'claude' },
      ],
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('http://omni/v1/models');
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
  });

  it('sends no Authorization header without a key', async () => {
    const fetchImpl = fetchReturning(() => json({ error: 'unauthorized' }, 401));
    expect(await probeOmniRoute({ ...CONFIG, apiKey: '' }, fetchImpl as unknown as typeof fetch)).toEqual({ reachable: true, status: 401, models: [] });
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({});
  });

  it('tells an unreachable router apart from one that answers with an error', async () => {
    expect(await probeOmniRoute(CONFIG, refused as unknown as typeof fetch)).toEqual({ reachable: false, error: 'ECONNREFUSED' });
    const broken = fetchReturning(() => json({}, 500));
    expect(await probeOmniRoute(CONFIG, broken as unknown as typeof fetch)).toEqual({ reachable: true, status: 500, models: [] });
  });
});

describe('testModel', () => {
  it('asks the model for a tiny reply and measures the latency', async () => {
    const fetchImpl = fetchReturning(() => json({ choices: [{ message: { role: 'assistant', content: 'OK' } }] }));
    const clock = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1234.4);
    const result = await testModel(CONFIG, { fetchImpl: fetchImpl as unknown as typeof fetch, now: clock });

    expect(result).toEqual({ ok: true, model: 'cc/model', latencyMs: 234 });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('http://omni/v1/chat/completions');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'cc/model', messages: [{ role: 'user', content: 'Reply with OK' }], stream: false });
  });

  it('reports the upstream error without the key', async () => {
    const fetchImpl = fetchReturning(() => json({ error: { message: `Invalid API key ${KEY}` } }, 401));
    const result = await testModel(CONFIG, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/^HTTP 401: Invalid API key \[redacted\]$/);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('fails on an answer without choices, on network errors and on timeouts', async () => {
    const empty = fetchReturning(() => json({ object: 'error' }));
    expect(await testModel(CONFIG, { fetchImpl: empty as unknown as typeof fetch })).toMatchObject({ ok: false, error: 'OmniRoute answered without a reply' });
    expect(await testModel(CONFIG, { fetchImpl: refused as unknown as typeof fetch })).toMatchObject({ ok: false, error: 'ECONNREFUSED' });
    const slow = () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    expect(await testModel(CONFIG, { fetchImpl: slow as unknown as typeof fetch })).toMatchObject({ ok: false, error: 'No answer within 30 s' });
  });

  it('keeps long upstream errors short and on one line', async () => {
    const fetchImpl = fetchReturning(() => new Response(`line one\n${'x'.repeat(1000)}`, { status: 502 }));
    const { error = '' } = await testModel(CONFIG, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(error.length).toBeLessThanOrEqual(300);
    expect(error).not.toContain('\n');
  });
});
