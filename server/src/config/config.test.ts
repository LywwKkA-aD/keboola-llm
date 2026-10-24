import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { readAppEnv } from './env.ts';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, settingsPatchSchema } from './settings.ts';

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
    expect(loadSettings(join(makeTree({}), 'settings.json'))).toEqual(DEFAULT_SETTINGS);
  });

  it('has safe defaults: dark theme, no SQL without asking, models and project from .env, no desktop notifications', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      language: 'ru',
      theme: 'dark',
      quality: 'high',
      reduceMotion: 'system',
      model: '',
      keboolaProject: '',
      allowSqlByDefault: false,
      desktopNotifications: false,
    });
  });

  it('falls back to defaults for a corrupt or invalid file', () => {
    const root = makeTree({ 'bad.json': '{oops', 'invalid.json': '{"language":"de"}' });
    expect(loadSettings(join(root, 'bad.json'))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(join(root, 'invalid.json'))).toEqual(DEFAULT_SETTINGS);
  });

  it('upgrades an old file that only has the language', () => {
    const root = makeTree({ 'old.json': '{"language":"cs"}' });
    expect(loadSettings(join(root, 'old.json'))).toEqual({ ...DEFAULT_SETTINGS, language: 'cs' });
  });

  it('saves a validated patch and returns a new object', () => {
    const file = join(makeTree({}), 'nested', 'settings.json');
    const current = loadSettings(file);
    const next = saveSettings(file, current, { language: 'cs', theme: 'light' });

    expect(next).toEqual({ ...DEFAULT_SETTINGS, language: 'cs', theme: 'light' });
    expect(current).toEqual(DEFAULT_SETTINGS);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(next);
    expect(loadSettings(file)).toEqual(next);
  });

  it('refuses invalid values', () => {
    const file = join(makeTree({}), 'settings.json');
    expect(() => saveSettings(file, DEFAULT_SETTINGS, { language: 'de' as never })).toThrow();
    expect(() => saveSettings(file, DEFAULT_SETTINGS, { keboolaProject: 'a b;rm' })).toThrow();
    expect(() => saveSettings(file, DEFAULT_SETTINGS, { quality: 'ultra' as never })).toThrow();
  });
});

describe('settingsPatchSchema', () => {
  it('keeps only the fields that were sent, without filling defaults', () => {
    expect(settingsPatchSchema.parse({ theme: 'light' })).toEqual({ theme: 'light' });
  });

  it('rejects unknown fields', () => {
    expect(settingsPatchSchema.safeParse({ theme: 'light', apiKey: 'x' }).success).toBe(false);
  });

  it('accepts the desktop notifications switch, only as a boolean', () => {
    expect(settingsPatchSchema.parse({ desktopNotifications: true })).toEqual({ desktopNotifications: true });
    expect(settingsPatchSchema.safeParse({ desktopNotifications: 'yes' }).success).toBe(false);
  });
});
