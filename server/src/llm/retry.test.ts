import { describe, expect, it } from 'vitest';
import { MAX_RETRY_AFTER_MS, modelErrorKind, onFailedAttempt, retryAfterMs } from './retry.ts';

/** The shape of the OpenAI client's APIError: a status, the response headers and the error payload. */
const apiError = (status: number | undefined, headers: Record<string, string> = {}, payload: Record<string, unknown> = {}) =>
  Object.assign(new Error(`${status ?? ''} upstream says no`), { status, headers: new Headers(headers), error: payload });

const connectionError = (code: string) => {
  const socket = Object.assign(new Error(`read ${code}`), { code });
  const fetchFailed = Object.assign(new TypeError('fetch failed'), { cause: socket });
  class APIConnectionError extends Error {}
  return Object.assign(new APIConnectionError('Connection error.'), { cause: fetchFailed });
};

describe('modelErrorKind', () => {
  it('treats rate limits, server errors and timeouts as transient', () => {
    expect(modelErrorKind(apiError(429))).toBe('transient');
    expect(modelErrorKind(apiError(500))).toBe('transient');
    expect(modelErrorKind(apiError(503))).toBe('transient');
    expect(modelErrorKind(apiError(408))).toBe('transient');
    expect(modelErrorKind(Object.assign(new Error('Request timed out.'), { name: 'TimeoutError' }))).toBe('transient');
  });

  it('treats dropped or refused connections as transient, also when wrapped', () => {
    expect(modelErrorKind(connectionError('ECONNRESET'))).toBe('transient');
    expect(modelErrorKind(connectionError('ECONNREFUSED'))).toBe('transient');
    expect(modelErrorKind(connectionError('UND_ERR_SOCKET'))).toBe('transient');
    expect(modelErrorKind(new TypeError('terminated'))).toBe('transient');
  });

  it('treats an error event inside a started stream as transient', () => {
    expect(modelErrorKind(apiError(undefined, {}, { message: 'overloaded', type: 'server_error' }))).toBe('transient');
  });

  it('looks through the errors the agent middleware wraps a failed model call in', () => {
    class MiddlewareError extends Error {}
    const wrap = (cause: unknown) => Object.assign(new MiddlewareError('503 upstream'), { cause });
    expect(modelErrorKind(wrap(wrap(apiError(503))))).toBe('transient');
    expect(modelErrorKind(wrap(apiError(401)))).toBe('permanent');
    expect(modelErrorKind(wrap(new Error('kbagent exited with code 2')))).toBeUndefined();
  });

  it('treats auth, validation and missing-model errors as permanent', () => {
    expect(modelErrorKind(apiError(400))).toBe('permanent');
    expect(modelErrorKind(apiError(401))).toBe('permanent');
    expect(modelErrorKind(apiError(403))).toBe('permanent');
    expect(modelErrorKind(apiError(404))).toBe('permanent');
    expect(modelErrorKind(apiError(422))).toBe('permanent');
  });

  it('treats an exhausted quota as permanent although it comes as a 429', () => {
    expect(modelErrorKind(apiError(429, {}, { code: 'insufficient_quota' }))).toBe('permanent');
    expect(modelErrorKind(Object.assign(apiError(429), { code: 'insufficient_quota' }))).toBe('permanent');
  });

  it('does not judge aborts and errors that did not come from the model call', () => {
    expect(modelErrorKind(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))).toBeUndefined();
    expect(modelErrorKind(new Error('kbagent exited with code 2'))).toBeUndefined();
    expect(modelErrorKind(new TypeError('x is not a function'))).toBeUndefined();
    expect(modelErrorKind('plain string')).toBeUndefined();
  });
});

describe('retryAfterMs', () => {
  it('reads Retry-After in seconds or as a date', () => {
    expect(retryAfterMs(apiError(429, { 'retry-after': '7' }))).toBe(7000);
    const at = new Date(Date.now() + 30_000).toUTCString();
    expect(retryAfterMs(apiError(503, { 'retry-after': at }))).toBeGreaterThan(25_000);
    expect(retryAfterMs(Object.assign(new Error('x'), { headers: { 'retry-after': '2' } }))).toBe(2000);
  });

  it('is undefined without a usable header', () => {
    expect(retryAfterMs(apiError(429))).toBeUndefined();
    expect(retryAfterMs(apiError(429, { 'retry-after': 'soon' }))).toBeUndefined();
    expect(retryAfterMs(new Error('x'))).toBeUndefined();
  });
});

describe('onFailedAttempt', () => {
  it('lets transient errors through to the next attempt', () => {
    expect(() => onFailedAttempt(apiError(503))).not.toThrow();
    expect(() => onFailedAttempt(connectionError('ECONNRESET'))).not.toThrow();
  });

  it('ends the call at once on permanent and unknown errors and on aborts', () => {
    const unauthorized = apiError(401);
    expect(() => onFailedAttempt(unauthorized)).toThrow(unauthorized);
    expect(() => onFailedAttempt(new Error('boom'))).toThrow('boom');
    expect(() => onFailedAttempt(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toThrow('aborted');
  });

  it('waits as long as the server asks, but gives up when that is too long', () => {
    const limited = apiError(429, { 'retry-after': '5' });
    onFailedAttempt(limited);
    expect((limited as { retryAfterMs?: number }).retryAfterMs).toBe(5000);

    const later = apiError(429, { 'retry-after': String(MAX_RETRY_AFTER_MS / 1000 + 1) });
    expect(() => onFailedAttempt(later)).toThrow(later);
  });
});
