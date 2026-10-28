import { describe, expect, it, vi } from 'vitest';
import type { ExecFn } from '../tools/kbagent/index.ts';
import { kbagentConfigSource, kbagentVersion, listKeboolaProjects } from './keboola.ts';
import { listModels, modelsOfProvider } from './models.ts';
import { systemStatus } from './status.ts';

const CONFIG = { baseUrl: 'http://omni/v1', apiKey: 'secret-key', model: 'm' };

const okJson = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });

describe('listModels', () => {
  it('asks OmniRoute with the server key and returns sorted unique models with their provider', async () => {
    const fetchImpl = vi.fn(async () => okJson({ data: [{ id: 'b/model', owned_by: 'x' }, { id: 'a/model' }, { id: 'b/model' }, { nope: 1 }] }));
    expect(await listModels(CONFIG, fetchImpl as unknown as typeof fetch)).toEqual([
      { id: 'a/model', provider: '' },
      { id: 'b/model', provider: 'x' },
    ]);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://omni/v1/models');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-key');
  });

  it('offers only models that can run agents: text output with tool calling', async () => {
    const fetchImpl = vi.fn(async () =>
      okJson({
        data: [
          { id: 'cc/claude', capabilities: { tool_calling: true }, output_modalities: ['text'] },
          { id: 'plain/llm' },
          { id: 'aihorde/2DN', type: 'image', output_modalities: ['image'], capabilities: { tool_calling: false } },
          { id: 'veo/clip', type: 'video' },
          { id: 'old/chat', capabilities: { tool_calling: false } },
          { id: 'tts/voice', output_modalities: ['audio'] },
          { id: 'embed/small', type: 'embedding' },
        ],
      }),
    );
    expect((await listModels(CONFIG, fetchImpl as unknown as typeof fetch)).map((model) => model.id)).toEqual(['cc/claude', 'plain/llm']);
  });

  it('fails with a message that does not echo the key', async () => {
    const fetchImpl = vi.fn(async () => new Response('denied', { status: 401 }));
    await expect(listModels(CONFIG, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/401/);
    await expect(listModels(CONFIG, fetchImpl as unknown as typeof fetch)).rejects.not.toThrow(/secret-key/);
  });
});

describe('modelsOfProvider', () => {
  // What OmniRoute lists with only Claude connected: the cc/ models, their claude/ and no-think/ aliases, a combo,
  // and keyless free providers.
  const catalog = [
    { id: 'aihorde/llama', provider: 'aihorde' },
    { id: 'auto/best-coding', provider: 'combo' },
    { id: 'cc/claude-haiku-5-5', provider: 'claude' },
    { id: 'cc/claude-opus-5-5', provider: 'claude' },
    { id: 'claude/claude-opus-5-5', provider: 'claude' },
    { id: 'ddgw/gpt', provider: 'duckduckgo-web' },
    { id: 'no-think/cc/claude-opus-5-5', provider: 'claude' },
  ];

  it('keeps the models of the default model\'s provider under its prefix', () => {
    expect(modelsOfProvider(catalog, 'cc/claude-opus-5-5').map((model) => model.id)).toEqual(['cc/claude-haiku-5-5', 'cc/claude-opus-5-5']);
  });

  it('keeps everything without a default model in the list or with a combo as default', () => {
    expect(modelsOfProvider(catalog, '')).toHaveLength(catalog.length);
    expect(modelsOfProvider(catalog, 'gone/model')).toHaveLength(catalog.length);
    expect(modelsOfProvider(catalog, 'auto/best-coding')).toHaveLength(catalog.length);
  });
});

const execReturning = (stdout: string, exitCode = 0): ExecFn => async () => ({ stdout, stderr: '', exitCode, timedOut: false });

describe('listKeboolaProjects', () => {
  it('returns aliases and names but never tokens', async () => {
    const stdout = JSON.stringify({
      status: 'ok',
      data: [
        {
          alias: 'sandbox',
          project_name: 'Sandbox',
          project_id: 6487,
          stack_url: 'https://connection.example',
          token: '6487-abcdefghijklmnopqrstuvwxyz',
          auth_mode: 'session',
          is_default: true,
          active_branch_id: null,
        },
      ],
    });
    const exec = vi.fn(execReturning(stdout));
    const projects = await listKeboolaProjects({ exec });

    expect(projects).toEqual([{ alias: 'sandbox', name: 'Sandbox', id: 6487, stackUrl: 'https://connection.example', isDefault: true }]);
    expect(JSON.stringify(projects)).not.toContain('abcdefghij');
    expect(exec.mock.calls[0]?.[1]).toEqual(['--json', 'project', 'list']);
  });

  it('reports kbagent failures with what kbagent said, so the setup step can show it', async () => {
    await expect(listKeboolaProjects({ exec: execReturning('{"status":"error","error":{"message":"no config"}}', 5) })).rejects.toThrow(
      'kbagent project list failed (exit 5): no config',
    );
    const stderrOnly: ExecFn = async () => ({ stdout: '', stderr: 'Traceback ...\nOSError: No username set in the environment\n', exitCode: 1, timedOut: false });
    await expect(listKeboolaProjects({ exec: stderrOnly })).rejects.toThrow(/exit 1\): .*No username set in the environment/);
    const slow: ExecFn = async () => ({ stdout: '', stderr: '', exitCode: null, timedOut: true });
    await expect(listKeboolaProjects({ exec: slow })).rejects.toThrow(/did not finish within 45 s/);
  });

  it('reads the projects from other shapes kbagent versions answer with', async () => {
    const entry = { project_name: 'Sandbox', project_id: 1, stack_url: 'https://c', is_default: true };
    const expected = [{ alias: 'sandbox', name: 'Sandbox', id: 1, stackUrl: 'https://c', isDefault: true }];
    for (const data of [{ projects: [{ alias: 'sandbox', ...entry }] }, { projects: { sandbox: entry } }, { sandbox: entry }]) {
      expect(await listKeboolaProjects({ exec: execReturning(JSON.stringify({ status: 'ok', data })) })).toEqual(expected);
    }
  });

  it('tells an empty list apart from a failure', async () => {
    await expect(listKeboolaProjects({ exec: execReturning('{"status":"ok","data":[]}') })).resolves.toEqual([]);
  });
});

describe('kbagentConfigSource', () => {
  it('reads the config source line of kbagent doctor, even when doctor reports problems', async () => {
    const doctor = { status: 'ok', data: { checks: [{ check: 'config_source', status: 'pass', message: 'Using global config at C:\\cfg\\config.json' }] } };
    expect(await kbagentConfigSource({ exec: execReturning(JSON.stringify(doctor), 1) })).toBe('Using global config at C:\\cfg\\config.json');
    expect(await kbagentConfigSource({ exec: execReturning('not json', 1) })).toBeUndefined();
  });
});

describe('kbagentVersion', () => {
  it('reads the version line', async () => {
    expect(await kbagentVersion({ exec: execReturning('kbagent v0.100.2\n') })).toBe('kbagent v0.100.2');
  });

  it('says plainly when kbagent cannot start', async () => {
    const exec: ExecFn = async () => ({ stdout: '', stderr: '', exitCode: null, timedOut: false, spawnError: 'ENOENT' });
    await expect(kbagentVersion({ exec })).rejects.toThrow('not installed or not on PATH');
  });

  it('throws when kbagent is missing', async () => {
    const exec: ExecFn = async () => {
      throw Object.assign(new Error('spawn kbagent ENOENT'), { code: 'ENOENT' });
    };
    await expect(kbagentVersion({ exec })).rejects.toThrow();
  });
});

describe('systemStatus', () => {
  it('collects the state of OmniRoute, kbagent, the app and Node', async () => {
    const status = await systemStatus({
      version: '0.1.0',
      models: async () => ['a', 'b'],
      kbagent: async () => 'kbagent v0.100.2',
      model: 'a',
    });
    expect(status).toEqual({
      app: { ok: true, detail: '0.1.0' },
      node: { ok: true, detail: process.version },
      omniroute: { ok: true, detail: '2 models' },
      model: { ok: true, detail: 'a' },
      kbagent: { ok: true, detail: 'kbagent v0.100.2' },
    });
  });

  it('marks unreachable parts without failing the whole check', async () => {
    const status = await systemStatus({
      version: '0.1.0',
      models: async () => {
        throw new Error('OmniRoute answered HTTP 401');
      },
      kbagent: async () => {
        throw new Error('not installed');
      },
      model: '',
    });
    expect(status.omniroute).toEqual({ ok: false, detail: 'OmniRoute answered HTTP 401' });
    expect(status.kbagent).toEqual({ ok: false, detail: 'not installed' });
    expect(status.model).toEqual({ ok: false, detail: 'not set' });
  });

  it('flags a configured model that OmniRoute does not list', async () => {
    const status = await systemStatus({ version: '1', models: async () => ['x'], kbagent: async () => 'v', model: 'gone' });
    expect(status.model).toEqual({ ok: false, detail: 'gone (not listed by OmniRoute)' });
  });
});
