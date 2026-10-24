#!/usr/bin/env node
/**
 * Evaluate the agent team: ask it known questions about a Keboola project and grade the answers.
 *
 *   npm run eval [-- --set evals/shop.json] [--only id,id] [--base http://127.0.0.1:4800] [--keep]
 *   npm run eval -- --regrade data/evals/<report>.json   grade a saved run again (after editing patterns), no model
 *
 * Runs against a running app with its real model and Keboola project, one new chat per scenario. Approvals are
 * rejected (SQL only runs where a scenario allows it), so an evaluation never changes the project. Chats are deleted
 * afterwards unless --keep; the report is written to <DATA_DIR>/evals/.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeAnswer, summarize } from './lib/eval-grade.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIO_TIMEOUT_MS = 15 * 60_000;
const REJECTION = 'Evaluation run: no changes are allowed. Answer from what you can read.';

const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const base = option('base', 'http://127.0.0.1:4800');
const setFile = resolve(ROOT, option('set', 'evals/shop.json'));
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

/** Reject whatever the chat waits for, so the run goes on without changing anything. */
async function rejectPending(threadId) {
  const pending = await api('GET', `/api/threads/${threadId}/approvals`);
  if (pending.length === 0) return;
  const answers = pending.map((approval) => ({
    interruptId: approval.interruptId,
    decisions: approval.requests.map(() => ({ type: 'reject', message: REJECTION })),
  }));
  await api('POST', `/api/threads/${threadId}/approvals`, { answers });
}

/** Follow the chat's event stream until its run finishes or fails, answering approvals on the way. */
async function waitForEnd(threadId) {
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
        if (event.type === 'run.waiting') await rejectPending(threadId);
        if (event.type === 'run.finished') return { ok: true };
        if (event.type === 'run.failed') return { ok: false, error: event.error };
      }
    }
    return { ok: false, error: 'event stream closed' };
  } catch (error) {
    return { ok: false, error: controller.signal.aborted ? 'timed out' : error.message };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function runScenario(scenario) {
  const started = Date.now();
  const { thread } = await api('POST', '/api/threads', { text: scenario.prompt });
  await api('PATCH', `/api/threads/${thread.id}`, { title: `[eval] ${scenario.id}` });
  if (scenario.allowSql) await api('PUT', `/api/threads/${thread.id}/policy`, { allowSql: true });
  const end = await waitForEnd(thread.id);
  const messages = await api('GET', `/api/threads/${thread.id}/messages`);
  const answer = messages.filter((message) => message.role === 'assistant').map((message) => message.text).join('\n\n');
  if (!keep) await api('DELETE', `/api/threads/${thread.id}`);
  const grade = gradeAnswer(scenario, answer);
  return { ...grade, ok: grade.ok && end.ok, seconds: Math.round((Date.now() - started) / 1000), ...(end.ok ? {} : { error: end.error }), answer };
}

const set = JSON.parse(readFileSync(setFile, 'utf8'));
const scenarios = set.scenarios.filter((scenario) => only.length === 0 || only.includes(scenario.id));
const regrade = option('regrade', '');
const saved = regrade ? new Map(JSON.parse(readFileSync(resolve(regrade), 'utf8')).results.map((result) => [result.id, result])) : undefined;
console.log(saved ? `Grading the answers in ${regrade} again\n` : `Evaluating ${scenarios.length} scenario(s) from ${setFile} against ${base}\n`);

/** A saved answer graded with the current patterns; the run's own outcome (errors, time) stays as it was. */
function regradeScenario(scenario) {
  const previous = saved.get(scenario.id);
  if (!previous) return { ...gradeAnswer(scenario, ''), ok: false, seconds: 0, error: 'not in the saved run', answer: '' };
  const grade = gradeAnswer(scenario, previous.answer);
  return { ...previous, ...grade, ok: grade.ok && !previous.error };
}

const results = [];
for (const scenario of scenarios) {
  const result = saved ? regradeScenario(scenario) : await runScenario(scenario);
  results.push(result);
  const notes = [...result.missed.map((name) => `missed: ${name}`), ...result.violations.map((name) => `forbidden: ${name}`), ...(result.error ? [`error: ${result.error}`] : [])];
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${scenario.id}  ${result.passed}/${result.total}  ${result.seconds}s${notes.length ? `\n      ${notes.join('\n      ')}` : ''}`);
}

const summary = summarize(results);
console.log(`\n${summary.scenariosOk}/${summary.scenarios} scenarios passed, ${summary.expectationsMet}/${summary.expectations} expectations met`);
const dir = join(process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(ROOT, 'data'), 'evals');
mkdirSync(dir, { recursive: true });
const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, `${JSON.stringify({ set: setFile, base, summary, results }, null, 2)}\n`);
console.log(`Report: ${file}`);
process.exitCode = summary.scenariosOk === summary.scenarios ? 0 : 1;
