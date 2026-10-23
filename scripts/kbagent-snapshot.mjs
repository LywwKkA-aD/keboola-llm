#!/usr/bin/env node
/**
 * Regenerate server/src/tools/kbagent/operations-snapshot.ts from the installed kbagent:
 * risk categories from `kbagent --json permissions list`, scope flags (--project, --branch)
 * from each command's --help. Run after upgrading kbagent; unknown operations are rejected.
 *
 *   npm run kbagent:snapshot
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'server', 'src', 'tools', 'kbagent', 'operations-snapshot.ts');

// Command groups whose subcommands are scanned for scope flags.
const GROUPS = [
  'search', 'component', 'config', 'job', 'storage', 'lineage', 'transformation', 'flow', 'schedule', 'branch',
  'merge-request', 'workspace', 'project', 'data-app', 'sharing', 'docs', 'billing', 'notification',
  'semantic-layer', 'sync', 'encrypt', 'stream', 'doctor', 'context', 'kai',
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

function render(version, operations, flagsByCommand) {
  const base = operations.filter((op) => !op.name.includes(' ')).toSorted((a, b) => a.name.localeCompare(b.name));
  const conditional = operations.filter((op) => op.name.includes(' ')).toSorted((a, b) => a.name.localeCompare(b.name));
  const lines = base.map((op) => `  ['${op.name}', '${op.category}', '${scopeOf(flagsByCommand, op.name)}'],`);
  const rules = conditional.map((op) => {
    const [name, ...when] = op.name.split(' ');
    return `  { operation: '${name}', when: ${JSON.stringify(when)}, category: '${op.category}' },`;
  });
  return `/**
 * Snapshot of kbagent v${version} operations, generated from \`kbagent --json permissions list\`
 * (risk category) and each command's \`--help\` (scope flags). Scope: p = accepts --project,
 * b = accepts --branch. Regenerate when upgrading kbagent; unknown operations are rejected.
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
writeFileSync(OUT, render(version, operations, scanFlags()));
console.log(`[ok] kbagent ${version}: ${operations.length} entries -> ${OUT}`);
