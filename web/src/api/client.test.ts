import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorResponse, stubApi } from '../test-utils/fake-api.ts';
import { ApiError, api, eventsUrl } from './client.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('sends GETs without a body or content type', async () => {
    const { calls } = stubApi({ 'GET /api/team': { lead: 'lead' } });
    await expect(api.team()).resolves.toEqual({ lead: 'lead' });
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/team', body: undefined, headers: undefined });
  });

  it('sends JSON bodies with a JSON content type', async () => {
    const { calls } = stubApi({ 'POST /api/threads/t1/messages': { runId: 'r1' } });
    await expect(api.send('t1', 'Hello')).resolves.toEqual({ runId: 'r1' });
    expect(calls[0]).toMatchObject({ body: { text: 'Hello' }, headers: { 'content-type': 'application/json' } });
  });

  it('omits the content type on bodiless POSTs (Fastify rejects empty JSON bodies)', async () => {
    const { calls } = stubApi({ 'POST /api/threads/t1/cancel': { cancelled: true } });
    await api.cancel('t1');
    expect(calls[0]?.headers).toBeUndefined();
  });

  it('turns error responses into ApiError with the server message', async () => {
    stubApi({ 'POST /api/threads/t1/messages': () => errorResponse(409, 'Thread is busy with another run') });
    const error = await api.send('t1', 'x').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: 'Thread is busy with another run' });
  });

  it('falls back to the status text when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502, statusText: 'Bad Gateway' })));
    await expect(api.threads()).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' });
  });

  it('resolves 204 responses to undefined', async () => {
    const { calls } = stubApi({ 'DELETE /api/threads/t1': undefined });
    await expect(api.remove('t1')).resolves.toBeUndefined();
    expect(calls[0]?.method).toBe('DELETE');
  });

  it('encodes thread ids in paths and event URLs', async () => {
    const { calls } = stubApi({ 'PUT /api/threads/a%2Fb/policy': { allowSql: true } });
    await api.setPolicy('a/b', { allowSql: true });
    expect(calls[0]?.path).toBe('/api/threads/a%2Fb/policy');
    expect(eventsUrl('a/b')).toBe('/api/events?threadId=a%2Fb');
    expect(eventsUrl()).toBe('/api/events');
  });

  it('reads the cross-chat and system endpoints', async () => {
    const { calls } = stubApi({
      'GET /api/approvals': [],
      'GET /api/status': { activeRuns: 1 },
      'GET /api/models': { models: ['m'], current: 'm' },
      'GET /api/keboola/projects': { projects: [], current: '' },
      'GET /api/memory': { content: 'x' },
      'GET /api/system': {},
    });
    await Promise.all([api.allApprovals(), api.status(), api.models(), api.keboolaProjects(), api.memory(), api.system()]);
    expect(calls.map((call) => call.path).toSorted()).toEqual([
      '/api/approvals',
      '/api/keboola/projects',
      '/api/memory',
      '/api/models',
      '/api/status',
      '/api/system',
    ]);
  });
});
