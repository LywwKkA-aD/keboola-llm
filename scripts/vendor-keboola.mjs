#!/usr/bin/env node
/**
 * Copy Keboola's official agents/skills into vendor/keboola at pinned commits.
 *
 *   npm run vendor:sync     re-sync the refs pinned in scripts/vendor-sources.json
 *   npm run vendor:update   move the pins to the latest commit of each branch, then sync
 *
 * Never edit vendor/ by hand: put overrides in agents/ or skills/ instead.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPathFilter } from './lib/path-filter.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, 'scripts', 'vendor-sources.json');
const VENDOR_ROOT = join(ROOT, 'vendor');
const SHA_RE = /^[0-9a-f]{40}$/;

const git = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function resolveLatest(source) {
  const sha = git(['ls-remote', source.repo, `refs/heads/${source.branch}`]).split(/\s+/)[0];
  if (!SHA_RE.test(sha)) throw new Error(`Cannot resolve ${source.branch} of ${source.repo}`);
  return sha;
}

function fetchSnapshot(source, workDir) {
  git(['init', '--quiet', workDir]);
  git(['fetch', '--quiet', '--depth', '1', source.repo, source.ref], workDir);
  git(['checkout', '--quiet', 'FETCH_HEAD'], workDir);
}

function listRegularFiles(dir) {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((rel) => !rel.split(/[\\/]/).includes('.git'))
    // lstat, not stat: a symlink in the upstream repo must never pull in files from outside it.
    .filter((rel) => lstatSync(join(dir, rel)).isFile());
}

function assertInsideVendor(path) {
  if (!path.startsWith(VENDOR_ROOT + sep)) throw new Error(`Refusing to write outside vendor/: ${path}`);
}

function syncSource(source, targetRoot) {
  if (!SHA_RE.test(source.ref)) throw new Error(`${source.name}: ref must be a full commit SHA`);
  const target = resolve(ROOT, targetRoot, source.name);
  assertInsideVendor(target);

  const workDir = mkdtempSync(join(tmpdir(), `vendor-${source.name}-`));
  try {
    fetchSnapshot(source, workDir);
    const files = listRegularFiles(workDir).filter(createPathFilter(source));
    rmSync(target, { recursive: true, force: true });
    files.forEach((rel) => {
      const to = join(target, rel);
      mkdirSync(dirname(to), { recursive: true });
      cpSync(join(workDir, rel), to);
    });
    return { name: source.name, repo: source.repo, ref: source.ref, license: source.license, files: files.length };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function main() {
  const latest = process.argv.includes('--latest');
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const sources = config.sources.map((source) => (latest ? { ...source, ref: resolveLatest(source) } : source));

  const results = sources.map((source) => {
    const result = syncSource(source, config.targetDir);
    console.log(`[ok] ${result.name} @ ${result.ref.slice(0, 12)}: ${result.files} files`);
    return result;
  });

  const versionsPath = resolve(ROOT, config.targetDir, 'VERSIONS.json');
  assertInsideVendor(versionsPath);
  writeFileSync(versionsPath, `${JSON.stringify({ sources: results }, null, 2)}\n`);
  if (latest) writeFileSync(CONFIG_PATH, `${JSON.stringify({ ...config, sources }, null, 2)}\n`);
}

main();
