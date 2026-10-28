#!/usr/bin/env node
/**
 * CI only (it overwrites kbagent's own config): register three projects in kbagent's global config with fake tokens
 * (listing projects reads the config only, no API call) and check that the app lists them the way it runs kbagent on
 * the analyst's PC: from the server folder, with its filtered environment. Then compare with a plain kbagent call.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (process.env.CI !== 'true') {
  console.error("Runs only in CI: it overwrites kbagent's config.");
  process.exit(2);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const kbagent = (args) => spawnSync('kbagent', args, { encoding: 'utf8', env: { ...process.env, KBAGENT_AUTO_UPDATE: 'false' } });

const doctor = kbagent(['--json', 'doctor']);
const checks = JSON.parse(doctor.stdout || '{}').data?.checks ?? [];
const configPath = checks.map((check) => /at (.+config\.json)/.exec(check.message ?? '')?.[1]).find(Boolean);
if (!configPath) throw new Error(`kbagent doctor did not name its config file:\n${doctor.stdout}\n${doctor.stderr}`);
console.log(`kbagent config: ${configPath}`);

const project = (name, id) => ({
  stack_url: 'https://connection.keboola.com',
  token: `${id}-not-a-real-token`,
  project_name: name,
  project_id: id,
  active_branch_id: null,
  active_branch_name: null,
  org_id: null,
  org_name: null,
});
mkdirSync(dirname(configPath), { recursive: true });
writeFileSync(
  configPath,
  JSON.stringify({ version: 1, default_project: 'alpha', projects: { alpha: project('Alpha', 101), beta: project('Beta', 102), gamma: project('Gamma', 103) } }, null, 2),
);

const plain = kbagent(['--json', 'project', 'list']);
console.log(`plain kbagent: exit ${plain.status}, ${(JSON.parse(plain.stdout || '{}').data ?? []).length} project(s)`);
if (plain.status !== 0) console.log(plain.stdout, plain.stderr);

// The app's own path: `npm start` runs the server from server/.
process.chdir(join(ROOT, 'server'));
const { kbagentVersion, listKeboolaProjects } = await import(pathToFileURL(join(ROOT, 'server', 'src', 'system', 'keboola.ts')).href);
console.log(`app: ${await kbagentVersion()}`);
const projects = await listKeboolaProjects();
const aliases = projects.map((entry) => entry.alias).toSorted();
console.log(`app lists: ${aliases.join(', ')}`);
if (aliases.join(',') !== 'alpha,beta,gamma') throw new Error('the app does not list the projects kbagent has');
