import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { readAppEnv } from './env.ts';
import { loadSettings, saveSettings } from './settings.ts';

describe('readAppEnv', () => {
  it('applies local-only defaults', () => {
    expect(readAppEnv({}, '/app')).toEqual({
      rootDir: '/app',
      dataDir: join('/app', 'data'),
      host: '127.0.0.1',
      port: 4800,
      webDevPort: 5173,
      keboolaProject: '',
      omniroute: { baseUrl: 'http://127.0.0.1:20128/v1', apiKey: '', model: '' },
    });
  });

  it('reads the default Keboola project alias', () => {
    expect(readAppEnv({ KEBOOLA_PROJECT: ' sandbox ' }, '/app').keboolaProject).toBe('sandbox');
  });

  it('reads overrides and trims values', () => {
    const env = readAppEnv(
      { PORT: '5000', HOST: ' 0.0.0.0 ', DATA_DIR: '/tmp/d', OMNIROUTE_BASE_URL: 'http://x/v1/', OMNIROUTE_API_KEY: ' k ', OMNIROUTE_MODEL: 'm' },
      '/app',
    );
    expect(env).toMatchObject({ port: 5000, host: '0.0.0.0', dataDir: '/tmp/d', omniroute: { baseUrl: 'http://x/v1', apiKey: 'k', model: 'm' } });
  });

  it('rejects an invalid port', () => {
    expect(() => readAppEnv({ PORT: 'abc' }, '/app')).toThrow(/PORT/);
    expect(() => readAppEnv({ PORT: '70000' }, '/app')).toThrow(/PORT/);
  });
});

describe('settings', () => {
  it('returns defaults when the file is missing', () => {
    expect(loadSettings(join(makeTree({}), 'settings.json'))).toEqual({ language: 'ru' });
  });

  it('falls back to defaults for a corrupt or invalid file', () => {
    const root = makeTree({ 'bad.json': '{oops', 'invalid.json': '{"language":"de"}' });
    expect(loadSettings(join(root, 'bad.json'))).toEqual({ language: 'ru' });
    expect(loadSettings(join(root, 'invalid.json'))).toEqual({ language: 'ru' });
  });

  it('saves a validated patch and returns a new object', () => {
    const file = join(makeTree({}), 'nested', 'settings.json');
    const current = loadSettings(file);
    const next = saveSettings(file, current, { language: 'cs' });

    expect(next).toEqual({ language: 'cs' });
    expect(current).toEqual({ language: 'ru' });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ language: 'cs' });
    expect(loadSettings(file)).toEqual({ language: 'cs' });
  });

  it('refuses an invalid patch', () => {
    const file = join(makeTree({}), 'settings.json');
    expect(() => saveSettings(file, { language: 'ru' }, { language: 'de' as never })).toThrow();
  });
});
