#!/usr/bin/env node
/**
 * Check how the lead routes requests: for each scenario, whom it hands the work to first (or every agent it should
 * involve). The run is stopped as soon as that is known, so a scenario costs one or two model calls of the lead.
 *
 *   npm run eval:routing [-- --set evals/routing.json] [--only id,id] [--base http://127.0.0.1:4800] [--keep]
 *
 * Runs against a running app with its real model and project, one new chat per scenario. Nothing is approved: a plan
 * the lead asks to approve counts as its answer and other approvals are rejected, so the project is never changed.
 * Chats are deleted afterwards unless --keep; the report goes to <DATA_DIR>/evals/.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeRouting, isSettled, PLAN } from './lib/routing-grade.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIO_TIMEOUT_MS = 4 * 60_000;
const PLAN_TOOL = 'request_plan_approval';
const REJECTION = 'Evaluation run: no changes are allowed.';

const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const base = option('base', 'http://127.0.0.1:4800');
const setFile = resolve(ROOT, option('set', 'evals/routing.json'));
const only = option('only', '')?.split(',').filter(Boolean) ?? [];
const keep = process.argv.includes('--keep');

async function api(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${await response.text()}`);
  return response.status === 204 ? undefined : response.json();
}

async function rejectPending(threadId) {
  const pending = await api('GET', `/api/threads/${threadId}/approvals`);
  if (pending.length === 0) return;
  const answers = pending.map((approval) => ({
    interruptId: approval.interruptId,
    decisions: approval.requests.map(() => ({ type: 'reject', message: REJECTION })),
  }));
  await api('POST', `/api/threads/${threadId}/approvals`, { answers });
}

/** Follow the chat until the routing is known or the run ends; returns the hand-offs in order. */
async function watch(threadId, scenario) {
  const handoffs = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCENARIO_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/api/events?threadId=${threadId}`, { signal: controller.signal });
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const data = frame.split('\n').find((line) => line.startsWith('data: '));
        if (!data) continue;
        const { event } = JSON.parse(data.slice(6));
        if (event.type === 'delegate.start' && !handoffs.includes(event.to)) handoffs.push(event.to);
        if (event.type === 'approval.required' && event.requests.some((request) => request.tool === PLAN_TOOL)) handoffs.push(PLAN);
        if (isSettled(scenario, handoffs) || handoffs.includes(PLAN)) return { handoffs };
        if (event.type === 'run.waiting') await rejectPending(threadId);
        if (event.type === 'run.finished') return { handoffs };
        if (event.type === 'run.failed') return { handoffs, error: event.error };
      }
    }
    return { handoffs, error: 'event stream closed' };
  } catch (error) {
    return { handoffs, error: controller.signal.aborted ? 'timed out' : error.message };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function runScenario(scenario) {
  const started = Date.now();
  const { thread } = await api('POST', '/api/threads', { text: scenario.prompt });
  await api('PATCH', `/api/threads/${thread.id}`, { title: `[routing] ${scenario.id}` });
  const seen = await watch(thread.id, scenario);
  await api('POST', `/api/threads/${thread.id}/cancel`).catch(() => {});
  if (!keep) await api('DELETE', `/api/threads/${thread.id}`).catch(() => {});
  return { id: scenario.id, ...gradeRouting(scenario, seen.handoffs), seconds: Math.round((Date.now() - started) / 1000), ...(seen.error ? { error: seen.error } : {}) };
}

const set = JSON.parse(readFileSync(setFile, 'utf8'));
const scenarios = set.scenarios.filter((scenario) => only.length === 0 || only.includes(scenario.id));
console.log(`Routing ${scenarios.length} scenario(s) from ${setFile} against ${base}\n`);

const results = [];
for (const scenario of scenarios) {
  const result = await runScenario(scenario);
  results.push(result);
  const want = `${scenario.all ? 'all of' : 'one of'} ${scenario.expect.join(', ')}`;
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${scenario.id}  -> ${result.got.join(', ')}  ${result.seconds}s${result.ok ? '' : `\n      wanted ${want}`}${result.violations.length ? `\n      forbidden: ${result.violations.join(', ')}` : ''}${result.error ? `\n      error: ${result.error}` : ''}`);
}

const passed = results.filter((result) => result.ok).length;
console.log(`\n${passed}/${results.length} scenarios routed as expected`);
const dir = join(process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(ROOT, 'data'), 'evals');
mkdirSync(dir, { recursive: true });
const file = join(dir, `routing-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, `${JSON.stringify({ set: setFile, base, passed, results }, null, 2)}\n`);
console.log(`Report: ${file}`);
process.exitCode = passed === results.length ? 0 : 1;
