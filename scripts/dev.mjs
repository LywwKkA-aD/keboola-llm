#!/usr/bin/env node
/**
 * Development: run the API server (restarts on change) and the Vite dev server together.
 * Open http://127.0.0.1:5173. Cross-platform: spawns node directly, no shell.
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const processes = [
  { name: 'server', args: ['--watch', join(ROOT, 'server', 'src', 'main.ts')], cwd: ROOT },
  { name: 'web', args: [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')], cwd: join(ROOT, 'web') },
];

const prefix = (name) => (chunk) =>
  chunk
    .toString()
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => console.log(`[${name}] ${line}`));

const children = processes.map(({ name, args, cwd }) => {
  const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.on('data', prefix(name));
  child.stderr.on('data', prefix(name));
  child.on('exit', (code) => {
    console.log(`[${name}] exited with ${code}`);
    stopAll(code ?? 1);
  });
  return child;
});

let stopping = false;
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.exitCode === null && child.kill());
  process.exitCode = code;
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
