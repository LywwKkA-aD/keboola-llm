/**
 * Environment for the kbagent child process. The parent env is filtered so that
 * secrets of the app (LLM keys, Keboola tokens, cloud credentials) never reach it;
 * per-agent credentials are passed explicitly through `extraEnv`.
 */

/** OS and network variables kbagent (a Python app) needs to start and reach Keboola. */
const PASSTHROUGH: ReadonlySet<string> = new Set([
  'PATH',
  'Path',
  'PATHEXT',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'SystemRoot',
  'SYSTEMROOT',
  'windir',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
  'https_proxy',
  'http_proxy',
  'no_proxy',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'REQUESTS_CA_BUNDLE',
]);

/** kbagent variables that are credentials or that the app controls itself. */
const CONTROLLED_KBAGENT: ReadonlySet<string> = new Set([
  'KBAGENT_SERVE_TOKEN',
  'KBAGENT_SERVE_URL',
  'KBAGENT_CONFIG_DIR',
  'KBAGENT_PROJECT',
  'KBAGENT_PROJECT_FROM_ENV',
  'KBAGENT_CONVERSATION_ID',
  'KBAGENT_ALLOW_AI_EXTRA_ARGS',
]);

const FIXED: Readonly<Record<string, string>> = {
  // An agent call must not upgrade the CLI behind the user's back (and change behavior mid-task).
  KBAGENT_AUTO_UPDATE: 'false',
  NO_COLOR: '1',
  // UTF-8 JSON on Windows consoles too.
  PYTHONIOENCODING: 'utf-8',
  PYTHONUTF8: '1',
};

export interface ChildEnvOptions {
  readonly parentEnv: NodeJS.ProcessEnv;
  readonly configDir?: string;
  readonly project?: string;
  readonly extraEnv?: Readonly<Record<string, string>>;
}

const keep = (name: string) =>
  PASSTHROUGH.has(name) || (name.startsWith('KBAGENT_') && !CONTROLLED_KBAGENT.has(name));

export function buildChildEnv({ parentEnv, configDir, project, extraEnv = {} }: ChildEnvOptions): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(
    Object.entries(parentEnv).filter((entry): entry is [string, string] => keep(entry[0]) && entry[1] !== undefined),
  );
  return {
    ...inherited,
    ...FIXED,
    ...(configDir === undefined ? {} : { KBAGENT_CONFIG_DIR: configDir }),
    // Default project for any command where the policy could not inject --project.
    ...(project === undefined ? {} : { KBAGENT_PROJECT: project }),
    ...extraEnv,
  };
}
