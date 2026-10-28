#!/usr/bin/env node
/**
 * Check that everything the app needs is installed and reachable: Node, then the same checklist as the
 * setup wizard on Home (server/src/setup/checks.ts), including one tiny test request to the model.
 * Exits 1 on any failure.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnv } from './lib/dotenv.mjs';
import { compareKbagent, snapshotVersion } from './lib/kbagent-version.mjs';
import { isSupportedNode } from './lib/node-version.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = process.env.ENV_FILE?.trim() || join(ROOT, '.env');
const SNAPSHOT_PATH = join(ROOT, 'server', 'src', 'tools', 'kbagent', 'operations-snapshot.ts');

/** What to do about a failed step, in the terminal; the wizard shows the same in the UI. */
const HINTS = {
  unreachable: 'install it with "npm install -g omniroute", then start it with "omniroute"',
  http: 'run "omniroute doctor" and restart OmniRoute',
  keyMissing: 'create a key in the OmniRoute dashboard (Endpoints), then save it on Home or in Settings, Setup',
  keyRejected: 'create a new key in the OmniRoute dashboard (Endpoints), then save it on Home or in Settings, Setup',
  modelMissing: 'choose a model on Home or in Settings (or set OMNIROUTE_MODEL in .env)',
  modelFailed: 'choose another model or check its provider in OmniRoute',
  kbagentMissing: 'install it (see README), then restart the app',
  projectsNone: 'run "kbagent project add --project <alias> --url <keboola-url> --token-stdin"',
  projectsFailed: 'run "kbagent doctor"',
  projectMissing: 'choose the project on Home or in Settings (or set KEBOOLA_PROJECT in .env)',
  projectUnknown: 'choose a registered project on Home or in Settings (or fix KEBOOLA_PROJECT in .env)',
};

const LEVELS = { ok: 'ok', fail: 'fail', blocked: 'skip' };

const print = (level, label, detail) => console.log(`[${level}] ${label}: ${detail}`);

/** kbagent newer or older than the permission snapshot still works, but the snapshot needs a refresh. */
function kbagentLine(step) {
  if (step.status !== 'ok') return undefined;
  const { level, detail } = compareKbagent(step.detail, snapshotVersion(readFileSync(SNAPSHOT_PATH, 'utf8')));
  return level === 'ok' ? undefined : ['warn', detail];
}

async function main() {
  if (!isSupportedNode(process.version)) {
    print('fail', 'Node.js', `${process.version} is not supported, install Node 24 LTS`);
    process.exitCode = 1;
    return;
  }
  print('ok', 'Node.js', process.version);
  loadDotEnv(ENV_PATH);
  print(existsSync(ENV_PATH) ? 'ok' : 'warn', '.env', existsSync(ENV_PATH) ? 'found' : 'missing: the setup wizard creates it, or copy .env.example to .env');

  // TypeScript modules of the server, loaded only once Node is known to run them.
  const { readAppEnv } = await import('../server/src/config/env.ts');
  const { loadSettings } = await import('../server/src/config/settings.ts');
  const { runSetupChecks, STEP_LABELS } = await import('../server/src/setup/checks.ts');
  const { probeOmniRoute, testModel } = await import('../server/src/setup/omniroute.ts');
  const { kbagentConfigSource, kbagentVersion, keboolaAccess, listKeboolaProjects } = await import('../server/src/system/keboola.ts');

  const env = readAppEnv(process.env, ROOT);
  // The app lets Settings override the model and project from .env; check what it would really use.
  const settings = loadSettings(join(env.dataDir, 'settings.json'));
  const omniroute = { ...env.omniroute, model: settings.model || env.omniroute.model };
  const keboolaProject = settings.keboolaProject || env.keboolaProject;
  const { steps } = await runSetupChecks({
    omniroute,
    keboolaProject,
    probeOmniRoute: () => probeOmniRoute(omniroute),
    testModel: () => testModel(omniroute),
    kbagentVersion: () => kbagentVersion(),
    keboolaProjects: () => listKeboolaProjects(),
    kbagentConfig: () => kbagentConfigSource(),
    // Read-only: the analyst's role and the project's features, as the app reads them.
    keboolaAccess: () => keboolaAccess(keboolaProject || undefined),
  });

  steps.forEach((step) => {
    const label = STEP_LABELS[step.id];
    const hint = step.reason ? HINTS[step.reason] : undefined;
    print(LEVELS[step.status], label, hint ? `${step.detail} -> ${hint}` : step.detail);
    const extra = step.id === 'kbagent' ? kbagentLine(step) : undefined;
    if (extra) print(extra[0], label, extra[1]);
  });
  process.exitCode = steps.some((step) => step.status !== 'ok') ? 1 : 0;
}

main();
