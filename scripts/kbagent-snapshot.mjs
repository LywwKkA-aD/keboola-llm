#!/usr/bin/env node
/**
 * Regenerate server/src/tools/kbagent/operations-snapshot.ts from the installed kbagent:
 * risk categories from `kbagent --json permissions list`, scope flags (--project, --branch)
 * from each command's --help. Run after upgrading kbagent; unknown operations are rejected.
 *
 *   npm run kbagent:snapshot             merge the installed kbagent into the snapshot
 *   npm run kbagent:snapshot -- --check  only say whether that would change it (CI: catch a new release that adds or
 *                                        reclassifies commands)
 *
 * The snapshot is the union of the kbagent versions it was made from, so the app works with each (analysts run 0.x
 * and 1.x side by side): an operation of any version is known, a category the versions disagree on takes the stricter
 * one, and --project/--branch are injected only where every version accepts them.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'server', 'src', 'tools', 'kbagent', 'operations-snapshot.ts');

// Command groups whose subcommands are scanned for scope flags.
const GROUPS = [
  'search', 'component', 'config', 'job', 'storage', 'lineage', 'transformation', 'flow', 'schedule', 'branch',
  'merge-request', 'workspace', 'project', 'data-app', 'sharing', 'docs', 'billing', 'notification',
  'semantic-layer', 'sync', 'encrypt', 'stream', 'doctor', 'context', 'kai', 'cls', 'rls',
];

const kbagent = (...args) =>
  execFileSync('kbagent', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Wide, colorless help output so table rows do not wrap; never self-update mid-scan.
    env: { ...process.env, COLUMNS: '200', NO_COLOR: '1', KBAGENT_AUTO_UPDATE: 'false' },
  });

const help = (...words) => {
  try {
    return kbagent(...words, '--help');
  } catch (error) {
    return String(error.stdout ?? '');
  }
};

const subcommandsOf = (text) => [...text.matchAll(/^│ ([a-z][a-z-]+) /gm)].map((match) => match[1]);
const flagsOf = (text) => new Set([...text.matchAll(/^│ {1,4}(?:\* {1,3})?(--[a-z0-9-]+)/gm)].map((match) => match[1]));

function scanFlags() {
  return new Map(
    GROUPS.flatMap((group) => {
      const subs = subcommandsOf(help(group));
      if (subs.length === 0) return [[group, flagsOf(help(group))]];
      return subs.map((sub) => [`${group}.${sub}`, flagsOf(help(group, sub))]);
    }),
  );
}

function scopeOf(flagsByCommand, name) {
  const flags = flagsByCommand.get(name);
  // Third-level semantic-layer verbs all take --project; help rows only cover two levels.
  if (!flags) return name.startsWith('semantic-layer.') && name.split('.').length === 3 ? 'p' : '';
  return `${flags.has('--project') ? 'p' : ''}${flags.has('--branch') ? 'b' : ''}`;
}

const STRICTNESS = ['read', 'write', 'destructive', 'admin'];
const stricter = (a, b) => (STRICTNESS.indexOf(a) >= STRICTNESS.indexOf(b) ? a : b);
const common = (a, b) => [...a].filter((letter) => b.includes(letter)).join('');

/** The operations and rules the snapshot file holds now, and the versions it was made from. */
function readSnapshot(text) {
  const versions = [...(/Snapshot of kbagent (v[\d., v]+) operations/.exec(text)?.[1] ?? '').matchAll(/v([\d.]+)/g)].map((m) => m[1]);
  const base = new Map([...text.matchAll(/^ {2}\['([^']+)', '(\w+)', '([pb]*)'\],$/gm)].map((m) => [m[1], { category: m[2], scope: m[3] }]));
  const rules = new Map([...text.matchAll(/^ {2}\{ operation: '([^']+)', when: (\[[^\]]*\]), category: '(\w+)' \},$/gm)].map((m) => [`${m[1]} ${m[2]}`, { name: m[1], when: m[2], category: m[3] }]));
  return { versions, base, rules };
}

/** The installed kbagent merged into the snapshot kept so far (see the file comment). */
function merge(previous, version, operations, flagsByCommand) {
  const base = new Map(previous.base);
  const rules = new Map(previous.rules);
  for (const op of operations) {
    if (op.name.includes(' ')) {
      const [name, ...when] = op.name.split(' ');
      const key = `${name} ${JSON.stringify(when)}`;
      const kept = rules.get(key);
      rules.set(key, { name, when: JSON.stringify(when), category: kept ? stricter(kept.category, op.category) : op.category });
      continue;
    }
    const scope = scopeOf(flagsByCommand, op.name);
    const kept = base.get(op.name);
    base.set(op.name, kept ? { category: stricter(kept.category, op.category), scope: common(kept.scope, scope) } : { category: op.category, scope });
  }
  const versions = [...new Set([...previous.versions, version])].toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return { versions, base, rules };
}

function render({ versions, base, rules: ruleMap }) {
  const lines = [...base].toSorted(([a], [b]) => a.localeCompare(b)).map(([name, op]) => `  ['${name}', '${op.category}', '${op.scope}'],`);
  const rules = [...ruleMap.values()]
    .toSorted((a, b) => `${a.name} ${a.when}`.localeCompare(`${b.name} ${b.when}`))
    .map((rule) => `  { operation: '${rule.name}', when: ${rule.when}, category: '${rule.category}' },`);
  return `/**
 * Snapshot of kbagent ${versions.map((v) => `v${v}`).join(', ')} operations, generated from \`kbagent --json permissions list\`
 * (risk category) and each command's \`--help\` (scope flags), merged over those versions: any version's
 * operation is known, the stricter category wins, and a scope letter means every version accepts the flag.
 * Scope: p = accepts --project, b = accepts --branch. Unknown operations are rejected.
 */
import type { Category, ConditionalRule, OperationEntry } from './types.ts';

export const OPERATIONS: readonly OperationEntry[] = [
${lines.join('\n')}
];

export const CONDITIONAL_RULES: readonly ConditionalRule[] = [
${rules.join('\n')}
];

export type { Category };
`;
}

const version = kbagent('--version').trim().replace(/^kbagent v?/, '');
const operations = JSON.parse(kbagent('--json', 'permissions', 'list')).data;
const current = readFileSync(OUT, 'utf8');
const rendered = render(merge(readSnapshot(current), version, operations, scanFlags()));
if (process.argv.includes('--check')) {
  const withoutVersion = (text) => text.split('\n').filter((line) => !line.includes('Snapshot of kbagent v'));
  const now = withoutVersion(rendered);
  const kept = withoutVersion(current);
  const added = now.filter((line) => !kept.includes(line));
  const removed = kept.filter((line) => !now.includes(line));
  if (added.length + removed.length === 0) {
    console.log(`[ok] kbagent ${version}: the permission snapshot matches`);
  } else {
    console.log(`[drift] kbagent ${version} differs from the permission snapshot; run npm run kbagent:snapshot and review:`);
    [...removed.map((line) => `- ${line.trim()}`), ...added.map((line) => `+ ${line.trim()}`)].slice(0, 60).forEach((line) => console.log(line));
    process.exitCode = 1;
  }
} else {
  writeFileSync(OUT, rendered);
  console.log(`[ok] kbagent ${version}: ${operations.length} entries -> ${OUT}`);
}
