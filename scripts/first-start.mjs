#!/usr/bin/env node
/**
 * Start the app the way a new user does (built web app, no .env, an empty data folder) and check that it serves the
 * UI, the setup checklist and the team. CI runs it on Windows, where the analyst works, and on Linux.
 *
 *   npm run build && npm run check:first-start
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.FIRST_START_PORT ?? '4810';
const BASE = `http://127.0.0.1:${PORT}`;
const START_TIMEOUT_MS = 90_000;

const dataDir = mkdtempSync(join(tmpdir(), 'agent-studio-first-start-'));
const server = spawn(process.execPath, ['server/src/main.ts'], {
  cwd: ROOT,
  // No OmniRoute key, model or project, and no .env: what a fresh clone has before the setup checklist.
  env: { ...process.env, PORT, DATA_DIR: dataDir, ENV_FILE: join(dataDir, 'missing.env'), OMNIROUTE_API_KEY: '', OMNIROUTE_MODEL: '', KEBOOLA_PROJECT: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', (chunk) => (output += chunk));
server.stderr.on('data', (chunk) => (output += chunk));

const get = async (path) => {
  const response = await fetch(`${BASE}${path}`);
  if (!response.ok) throw new Error(`GET ${path}: HTTP ${response.status}`);
  return response;
};

async function waitForServer() {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`the server exited with code ${server.exitCode}`);
    try {
      return await get('/api/status');
    } catch {
      await new Promise((done) => setTimeout(done, 500));
    }
  }
  throw new Error(`the server did not answer within ${START_TIMEOUT_MS / 1000} s`);
}

const checks = [
  ['the web app', async () => {
    const html = await (await get('/')).text();
    if (!html.includes('id="root"')) throw new Error('/ is not the web app');
  }],
  ['the setup checklist', async () => {
    const report = await (await get('/api/setup')).json();
    const ids = report.steps.map((step) => step.id);
    if (!ids.includes('omniroute') || !ids.includes('model')) throw new Error(`unexpected steps: ${ids.join(', ')}`);
    if (report.complete) throw new Error('a fresh install cannot be complete');
  }],
  ['the team', async () => {
    const team = await (await get('/api/team')).json();
    if (team.lead !== 'lead' || team.agents.filter((agent) => agent.enabled).length < 5) throw new Error('the team is missing agents');
    if (team.loadErrors.length > 0) throw new Error(`definitions failed to load: ${team.loadErrors.map((error) => error.file).join(', ')}`);
  }],
  ['the chat list', async () => {
    const threads = await (await get('/api/threads')).json();
    if (!Array.isArray(threads) || threads.length > 0) throw new Error('a fresh install should have no chats');
  }],
];

let failed = false;
try {
  await waitForServer();
  for (const [name, check] of checks) {
    try {
      await check();
      console.log(`ok    ${name}`);
    } catch (error) {
      failed = true;
      console.log(`FAIL  ${name}: ${error.message}`);
    }
  }
} catch (error) {
  failed = true;
  console.log(`FAIL  start: ${error.message}`);
} finally {
  server.kill();
  await new Promise((done) => (server.exitCode === null ? server.once('exit', done) : done()));
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
if (failed) console.log(`\nServer output:\n${output}`);
process.exitCode = failed ? 1 : 0;
