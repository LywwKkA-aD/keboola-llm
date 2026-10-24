/**
 * Start the stub LLM and the real app server against it: a fresh data dir (holding the app's .env), port 4900, a
 * fake key and no kbagent on PATH, so nothing reaches OmniRoute or Keboola. The returned function tears it all down.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { MODEL_ID } from './stub-llm/scenarios.mjs';
import { startStubLlm } from './stub-llm/server.mjs';
import { APP_PORT, BASE_URL, removeE2eSkill, ROOT } from './support/paths.ts';

const STARTUP_TIMEOUT_MS = 30_000;

/** PATH without the directories that hold kbagent: the tests must never run it. */
const pathWithoutKbagent = (path: string) =>
  path
    .split(delimiter)
    .filter((dir) => dir && !existsSync(join(dir, 'kbagent')))
    .join(delimiter);

/** A minimal environment: no OmniRoute, Keboola or tracing variables leak in from the developer's shell. */
function appEnv(stubUrl: string, dataDir: string): NodeJS.ProcessEnv {
  const keep = ['HOME', 'TMPDIR', 'LANG', 'TZ'].filter((name) => process.env[name] !== undefined);
  return {
    ...Object.fromEntries(keep.map((name) => [name, process.env[name]])),
    PATH: pathWithoutKbagent(process.env.PATH ?? ''),
    HOST: '127.0.0.1',
    PORT: String(APP_PORT),
    DATA_DIR: dataDir,
    OMNIROUTE_BASE_URL: stubUrl,
    OMNIROUTE_API_KEY: 'e2e-fake-key',
    OMNIROUTE_MODEL: MODEL_ID,
    KEBOOLA_PROJECT: '',
    // The setup wizard saves the OmniRoute key here, never to the checkout's own .env.
    ENV_FILE: envFileIn(dataDir),
  };
}

/** The .env the app reads and the setup wizard writes; specs find it through E2E_ENV_FILE. */
const envFileIn = (dataDir: string) => join(dataDir, 'app.env');

async function waitForHealth(app: ChildProcess, output: () => string): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) throw new Error(`App server exited with code ${app.exitCode}:\n${output()}`);
    const healthy = await fetch(`${BASE_URL}/api/health`).then(
      (response) => response.ok,
      () => false,
    );
    if (healthy) return;
    await delay(100);
  }
  throw new Error(`App server did not answer on ${BASE_URL} within ${STARTUP_TIMEOUT_MS} ms:\n${output()}`);
}

const stop = (app: ChildProcess) =>
  new Promise<void>((resolve) => {
    if (app.exitCode !== null || app.signalCode !== null) return resolve();
    app.once('exit', () => resolve());
    app.kill('SIGTERM');
  });

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (!existsSync(join(ROOT, 'web', 'dist', 'index.html'))) {
    throw new Error('web/dist is missing: run `npm run build -w web` (or `npm run test:e2e`, which builds first).');
  }
  const probe = await fetch(`${BASE_URL}/api/health`).then(
    () => true,
    () => false,
  );
  if (probe) throw new Error(`Port ${APP_PORT} is already in use; stop whatever listens there first.`);

  removeE2eSkill();
  const dataDir = mkdtempSync(join(tmpdir(), 'keboola-llm-e2e-'));
  process.env.E2E_ENV_FILE = envFileIn(dataDir);
  const stub = await startStubLlm();
  const app = spawn(process.execPath, [join('server', 'src', 'main.ts')], {
    cwd: ROOT,
    env: appEnv(stub.url, dataDir),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  app.stdout?.on('data', (data: Buffer) => {
    log += data.toString();
  });
  // Warnings and failed runs go to stderr; show them, they explain a red test.
  app.stderr?.on('data', (data: Buffer) => {
    log += data.toString();
    process.stderr.write(`[app] ${data.toString()}`);
  });

  const teardown = async () => {
    await stop(app);
    await stub.close();
    removeE2eSkill();
    rmSync(dataDir, { recursive: true, force: true });
  };

  try {
    await waitForHealth(app, () => log);
    // CI runners render WebGL in software on two cores: the light scene keeps the browser's main thread
    // responsive enough to navigate while the aquarium is up.
    const saved = await fetch(`${BASE_URL}/api/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quality: 'low' }),
    });
    if (!saved.ok) throw new Error(`Could not set the aquarium quality: HTTP ${saved.status}`);
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}
