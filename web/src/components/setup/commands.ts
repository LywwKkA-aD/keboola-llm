/**
 * The commands the setup wizard offers to copy, for the system the browser runs on (the app is local, so
 * that is the system the commands run on). Windows gets PowerShell variants, the same ones the README has.
 */
import type { SetupReason } from '../../api/setup-types.ts';

export type Os = 'windows' | 'mac' | 'linux';

interface NavigatorLike {
  readonly userAgent?: string;
  readonly platform?: string;
  readonly userAgentData?: { readonly platform?: string };
}

export function detectOs(nav: NavigatorLike = navigator): Os {
  const hints = [nav.userAgentData?.platform, nav.platform, nav.userAgent].filter(Boolean).join(' ');
  if (/win(dows|32|64)/i.test(hints)) return 'windows';
  return /mac/i.test(hints) ? 'mac' : 'linux';
}

const KBAGENT_INSTALL: Readonly<Record<'unix' | 'windows', string>> = {
  unix: 'curl -LsSf https://raw.githubusercontent.com/keboola/cli/main/install.sh | sh',
  // Keboola's PowerShell block (github.com/keboola/cli#install) with uv's own installer instead of winget, so no admin
  // rights are needed; uv's folder joins this window's PATH so the whole block runs in one paste.
  windows: [
    'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"',
    '$env:Path = "$env:USERPROFILE\\.local\\bin;$env:Path"',
    '$ver = (Invoke-RestMethod "https://pypi.org/pypi/keboola-cli/json").info.version',
    'uv tool install --force "keboola-cli[server] @ https://github.com/keboola/cli/releases/download/v$ver/keboola_cli-$ver-py3-none-any.whl"',
    'if ($LASTEXITCODE -ne 0 -and $ver) { uv tool install --force "keboola-cli[server]==$ver" }',
    'if ($LASTEXITCODE -ne 0) { uv tool install --force "keboola-cli[server]" }',
    'uv tool update-shell',
  ].join('\n'),
};

/** The command that fixes a failed step; undefined where the wizard has a form or a picker instead. */
export function commandFor(reason: SetupReason, os: Os): string | undefined {
  switch (reason) {
    case 'unreachable':
      return 'npm install -g omniroute\nomniroute';
    case 'http':
      return 'omniroute doctor';
    case 'kbagentMissing':
      return os === 'windows' ? KBAGENT_INSTALL.windows : KBAGENT_INSTALL.unix;
    case 'projectsFailed':
    case 'accessUnreadable':
      return 'kbagent doctor';
    case 'sessionExpired':
      return 'kbagent auth login';
    default:
      return undefined;
  }
}

/** The Keboola stack (scheme and host) of any address pasted from the browser. */
export function stackUrl(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return ['https:', 'http:'].includes(url.protocol) && url.hostname.includes('.') ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/** A kbagent alias that is safe to paste into a shell: letters, digits, dot, dash, underscore. */
export const isAlias = (alias: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(alias);

/** Register a project with a Storage API token, which kbagent asks for itself (hidden input). */
export const connectCommand = (alias: string, url: string) => `kbagent project add --project ${alias} --url ${url} --token-stdin`;

/** The same without a token: sign in in the browser and register the projects the user can access. */
export const browserLoginCommand = (url: string) => `kbagent auth login --stack ${url} --register-projects`;
