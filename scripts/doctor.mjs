#!/usr/bin/env node
/** Check that everything the app needs is installed and reachable. Exits 1 on any failure. */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadDotEnv } from './lib/dotenv.mjs';
import { compareKbagent, snapshotVersion } from './lib/kbagent-version.mjs';
import { isSupportedNode } from './lib/node-version.mjs';
import { readOmniRouteConfig } from './lib/omniroute-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env');
const SNAPSHOT_PATH = join(ROOT, 'server', 'src', 'tools', 'kbagent', 'operations-snapshot.ts');
const run = promisify(execFile);

const ok = (label, detail) => ({ level: 'ok', label, detail });
const warn = (label, detail) => ({ level: 'warn', label, detail });
const fail = (label, detail) => ({ level: 'fail', label, detail });

function checkNode() {
  return isSupportedNode(process.version)
    ? ok('Node.js', process.version)
    : fail('Node.js', `${process.version} is not supported, install Node 24 LTS`);
}

function checkEnvFile() {
  return existsSync(ENV_PATH) ? ok('.env', 'found') : fail('.env', 'missing: copy .env.example to .env');
}

async function checkOmniRoute({ baseUrl, apiKey, model }) {
  const label = 'OmniRoute';
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 || response.status === 403) {
      return fail(label, `running at ${baseUrl}, but OMNIROUTE_API_KEY is missing or wrong`);
    }
    if (!response.ok) return fail(label, `${baseUrl}/models answered HTTP ${response.status}`);
    const ids = ((await response.json()).data ?? []).map((entry) => entry.id);
    if (!model) return warn(label, `${ids.length} models available, set OMNIROUTE_MODEL in .env`);
    return ids.includes(model)
      ? ok(label, `${ids.length} models, using ${model}`)
      : warn(label, `${model} is not in /models (fine for combos, otherwise check the id)`);
  } catch {
    return fail(label, `not reachable at ${baseUrl}: start it with "omniroute"`);
  }
}

async function checkKbagent() {
  try {
    const { stdout } = await run('kbagent', ['--version'], { timeout: 15000, env: { ...process.env, KBAGENT_AUTO_UPDATE: 'false' } });
    const snapshot = snapshotVersion(readFileSync(SNAPSHOT_PATH, 'utf8'));
    const { level, detail } = compareKbagent(stdout, snapshot);
    return level === 'ok' ? ok('kbagent', detail) : warn('kbagent', detail);
  } catch {
    return warn('kbagent', 'not found on PATH: Keboola agents will be disabled (see README)');
  }
}

async function main() {
  loadDotEnv(ENV_PATH);
  const results = [
    checkNode(),
    checkEnvFile(),
    await checkOmniRoute(readOmniRouteConfig(process.env)),
    await checkKbagent(),
  ];
  results.forEach(({ level, label, detail }) => console.log(`[${level}] ${label}: ${detail}`));
  process.exitCode = results.some((result) => result.level === 'fail') ? 1 : 0;
}

main();
