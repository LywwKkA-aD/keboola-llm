import { describe, expect, it } from 'vitest';
import { browserLoginCommand, commandFor, connectCommand, detectOs, isAlias, stackUrl } from './commands.ts';

describe('detectOs', () => {
  it('recognises Windows from client hints, the platform or the user agent', () => {
    expect(detectOs({ userAgentData: { platform: 'Windows' } })).toBe('windows');
    expect(detectOs({ platform: 'Win32' })).toBe('windows');
    expect(detectOs({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe('windows');
  });

  it('tells macOS and Linux apart', () => {
    expect(detectOs({ platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Darwin' })).toBe('mac');
    expect(detectOs({ platform: 'Linux x86_64' })).toBe('linux');
    expect(detectOs({})).toBe('linux');
  });
});

describe('commandFor', () => {
  it('installs and starts OmniRoute the same way everywhere', () => {
    expect(commandFor('unreachable', 'windows')).toBe('npm install -g omniroute\nomniroute');
    expect(commandFor('unreachable', 'mac')).toBe('npm install -g omniroute\nomniroute');
    expect(commandFor('http', 'linux')).toBe('omniroute doctor');
  });

  it('installs kbagent with the script on macOS and Linux and with uv in PowerShell', () => {
    const script = 'curl -LsSf https://raw.githubusercontent.com/keboola/cli/main/install.sh | sh';
    expect(commandFor('kbagentMissing', 'mac')).toBe(script);
    expect(commandFor('kbagentMissing', 'linux')).toBe(script);
    // PowerShell, no admin rights: uv's own installer, then Keboola's block (version from PyPI, two fallbacks), all in
    // one window: uv's folder joins this window's PATH before uv is used.
    const windows = (commandFor('kbagentMissing', 'windows') ?? '').split('\n');
    expect(windows[0]).toBe('powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"');
    expect(windows[1]).toBe('$env:Path = "$env:USERPROFILE\\.local\\bin;$env:Path"');
    expect(windows[2]).toContain('https://pypi.org/pypi/keboola-cli/json');
    expect(windows.filter((line) => line.includes('uv tool install --force'))).toHaveLength(3);
    expect(windows.at(-1)).toBe('uv tool update-shell');
    expect(windows.join('\n')).not.toContain('winget');
  });

  it('has nothing to run where the UI offers a control instead', () => {
    expect(commandFor('keyMissing', 'mac')).toBeUndefined();
    expect(commandFor('modelMissing', 'windows')).toBeUndefined();
    expect(commandFor('projectMissing', 'linux')).toBeUndefined();
    expect(commandFor('projectsFailed', 'windows')).toBe('kbagent doctor');
  });
});

describe('connecting a Keboola project', () => {
  it('takes the stack from whatever Keboola address is pasted', () => {
    expect(stackUrl('https://connection.eu-central-1.keboola.com/admin/projects/123/dashboard')).toBe('https://connection.eu-central-1.keboola.com');
    expect(stackUrl(' connection.keboola.com ')).toBe('https://connection.keboola.com');
    expect(stackUrl('')).toBeUndefined();
    expect(stackUrl('not a url at all')).toBeUndefined();
    expect(stackUrl('ftp://connection.keboola.com')).toBeUndefined();
  });

  it('accepts plain aliases only, so the command is safe to paste', () => {
    expect(isAlias('main')).toBe(true);
    expect(isAlias('prod.eu_1-x')).toBe(true);
    expect(isAlias('-rf')).toBe(false);
    expect(isAlias('a b')).toBe(false);
    expect(isAlias('x;rm')).toBe(false);
    expect(isAlias('')).toBe(false);
  });

  it('builds the kbagent commands: the token is typed into kbagent, never into the app', () => {
    expect(connectCommand('main', 'https://connection.keboola.com')).toBe('kbagent project add --project main --url https://connection.keboola.com --token-stdin');
    expect(browserLoginCommand('https://connection.keboola.com')).toBe('kbagent auth login --stack https://connection.keboola.com --register-projects');
  });
});
