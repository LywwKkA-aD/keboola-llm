import { describe, expect, it } from 'vitest';
import { stubApi } from '../test-utils/fake-api.ts';
import { versionsApi } from './client.ts';

describe('versions api', () => {
  it('reads tracked definitions, versions and one version', async () => {
    const { calls } = stubApi({
      'GET /api/definitions/skills': [],
      'GET /api/definitions/agents/lead/versions': [],
      'GET /api/definitions/agents/lead/versions/3': { id: 3 },
    });
    await Promise.all([versionsApi.tracked('skills'), versionsApi.list('agents', 'lead'), versionsApi.get('agents', 'lead', 3)]);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'GET /api/definitions/skills',
      'GET /api/definitions/agents/lead/versions',
      'GET /api/definitions/agents/lead/versions/3',
    ]);
  });

  it('restores with a bodiless POST and encodes names', async () => {
    const { calls } = stubApi({ 'POST /api/definitions/skills/a%2Fb/versions/2/restore': { changed: true } });
    await expect(versionsApi.restore('skills', 'a/b', 2)).resolves.toEqual({ changed: true });
    expect(calls[0]).toMatchObject({ method: 'POST', body: undefined, headers: undefined });
  });
});
