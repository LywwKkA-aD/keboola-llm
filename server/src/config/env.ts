import { join } from 'node:path';

export interface OmniRouteConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

export interface AppEnv {
  readonly rootDir: string;
  readonly dataDir: string;
  readonly host: string;
  readonly port: number;
  // Port of the Vite dev server, allowed as an origin during development.
  readonly webDevPort: number;
  readonly omniroute: OmniRouteConfig;
}

type Env = Readonly<Record<string, string | undefined>>;

function readPort(raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT must be 1-65535, got "${raw}"`);
  return port;
}

/** Read app configuration from an env-like object. Defaults keep everything on loopback. */
export function readAppEnv(env: Env, rootDir: string): AppEnv {
  const value = (name: string) => (env[name] ?? '').trim();
  return {
    rootDir,
    dataDir: value('DATA_DIR') || join(rootDir, 'data'),
    host: value('HOST') || '127.0.0.1',
    port: readPort(value('PORT') || '4800'),
    webDevPort: readPort(value('WEB_DEV_PORT') || '5173'),
    omniroute: {
      baseUrl: (value('OMNIROUTE_BASE_URL') || 'http://127.0.0.1:20128/v1').replace(/\/+$/, ''),
      apiKey: value('OMNIROUTE_API_KEY'),
      model: value('OMNIROUTE_MODEL'),
    },
  };
}
