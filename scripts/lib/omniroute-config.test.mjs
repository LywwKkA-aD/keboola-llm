import { describe, expect, it } from 'vitest';
import { readOmniRouteConfig } from './omniroute-config.mjs';

describe('readOmniRouteConfig', () => {
  it('falls back to the local loopback endpoint', () => {
    expect(readOmniRouteConfig({})).toEqual({ baseUrl: 'http://127.0.0.1:20128/v1', apiKey: '', model: '' });
  });

  it('reads values from the environment and strips trailing slashes', () => {
    const env = { OMNIROUTE_BASE_URL: 'http://localhost:9999/v1//', OMNIROUTE_API_KEY: 'k', OMNIROUTE_MODEL: 'm' };
    expect(readOmniRouteConfig(env)).toEqual({ baseUrl: 'http://localhost:9999/v1', apiKey: 'k', model: 'm' });
  });

  it('trims accidental whitespace around values', () => {
    expect(readOmniRouteConfig({ OMNIROUTE_API_KEY: '  k \n', OMNIROUTE_MODEL: ' m ' })).toMatchObject({
      apiKey: 'k',
      model: 'm',
    });
  });
});
