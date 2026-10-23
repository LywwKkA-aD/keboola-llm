import { describe, expect, it } from 'vitest';
import type { BusEvent } from '../api/types.ts';
import { initialRunState, reduceRun } from './run-state.ts';

const lead = 'lead';
const apply = (events: BusEvent[], state = initialRunState(lead)) => events.reduce(reduceRun, state);

describe('reduceRun', () => {
  it('streams the lead agent text and ignores subagent tokens in the chat', () => {
    const state = apply([
      { type: 'run.started', runId: 'r1' },
      { type: 'token', agent: 'lead', text: 'Hel' },
      { type: 'token', agent: 'helper', text: 'internal' },
      { type: 'token', agent: 'lead', text: 'lo' },
    ]);
    expect(state.status).toBe('running');
    expect(state.streamingText).toBe('Hello');
  });

  it('records delegations and tool calls as activities, closing them on end', () => {
    const state = apply([
      { type: 'run.started', runId: 'r1' },
      { type: 'delegate.start', agent: 'lead', callId: 'd1', to: 'helper', task: 'Look it up' },
      { type: 'tool.start', agent: 'helper', callId: 't1', tool: 'kbagent_read', args: { purpose: 'List configs' } },
      { type: 'tool.end', agent: 'helper', callId: 't1', tool: 'kbagent_read', ok: true, preview: '[]' },
      { type: 'delegate.end', agent: 'lead', callId: 'd1', to: 'helper', ok: true },
    ]);
    expect(state.activities).toEqual([
      { id: 'd1', kind: 'delegate', agent: 'lead', target: 'helper', label: 'Look it up', status: 'done' },
      { id: 't1', kind: 'tool', agent: 'helper', target: 'kbagent_read', label: 'List configs', status: 'done' },
    ]);
  });

  it('marks failed tools', () => {
    const state = apply([
      { type: 'tool.start', agent: 'helper', callId: 't1', tool: 'ls', args: {} },
      { type: 'tool.end', agent: 'helper', callId: 't1', tool: 'ls', ok: false, preview: 'boom' },
    ]);
    expect(state.activities[0]).toMatchObject({ status: 'failed', label: 'ls' });
  });

  it('collects approvals and switches to waiting', () => {
    const state = apply([
      { type: 'run.started', runId: 'r1' },
      { type: 'approval.required', interruptId: 'i1', requests: [{ tool: 'write_file', args: {}, decisions: ['approve', 'reject'] }] },
      { type: 'run.waiting', runId: 'r1' },
    ]);
    expect(state.status).toBe('waiting');
    expect(state.approvals.map((approval) => approval.interruptId)).toEqual(['i1']);
  });

  it('clears approvals and the stream when a new run starts', () => {
    const waiting = apply([
      { type: 'token', agent: 'lead', text: 'x' },
      { type: 'approval.required', interruptId: 'i1', requests: [] },
    ]);
    const resumed = reduceRun(waiting, { type: 'run.started', runId: 'r2' });
    expect(resumed.approvals).toEqual([]);
    expect(resumed.streamingText).toBe('');
  });

  it('finishes and fails runs', () => {
    expect(apply([{ type: 'run.started', runId: 'r' }, { type: 'run.finished', runId: 'r' }]).status).toBe('idle');
    const failed = apply([{ type: 'run.failed', runId: 'r', error: 'model down' }]);
    expect(failed).toMatchObject({ status: 'failed', error: 'model down' });
  });

  it('sums token usage per run', () => {
    const state = apply([
      { type: 'usage', agent: 'lead', input: 100, output: 10, cached: 90 },
      { type: 'usage', agent: 'helper', input: 50, output: 5, cached: 0 },
    ]);
    expect(state.usage).toEqual({ input: 150, output: 15, cached: 90 });
  });

  it('logs approvals the app granted on the chat permission', () => {
    const state = apply([
      {
        type: 'approval.auto',
        interruptId: 'i9',
        requests: [{ tool: 'kbagent_sql', args: { args: ['workspace', 'query'], purpose: 'Count orders' }, decisions: ['approve'] }],
      },
    ]);
    expect(state.activities).toEqual([
      { id: 'auto-i9-0', kind: 'auto', agent: 'app', target: 'kbagent_sql', label: 'Count orders', status: 'done' },
    ]);
    expect(state.approvals).toEqual([]);
  });

  it('tracks which agents are busy', () => {
    const started = apply([
      { type: 'delegate.start', agent: 'lead', callId: 'd1', to: 'helper', task: 't' },
      { type: 'tool.start', agent: 'helper', callId: 't1', tool: 'ls', args: {} },
    ]);
    expect(started.busyAgents).toEqual(['helper']);
    const done = reduceRun(started, { type: 'delegate.end', agent: 'lead', callId: 'd1', to: 'helper', ok: true });
    expect(done.busyAgents).toEqual([]);
  });
});
