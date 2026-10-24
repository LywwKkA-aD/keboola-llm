import { describe, expect, it } from 'vitest';
import type { BusEvent, Envelope } from '../api/types.ts';
import { initialLive, reduceLive } from './live-state.ts';
import { pushSignal, type Signal } from './signals.ts';

let seq = 0;
const env = (event: BusEvent, threadId = 't1'): Envelope => ({ seq: ++seq, threadId, event });
const play = (events: Envelope[]) => events.reduce((state, envelope) => reduceLive(state, envelope, 100), initialLive());

const SQL_REQUEST = { tool: 'kbagent_sql', agent: 'keboola-developer', args: { sql: 'SELECT * FROM customers' }, decisions: ['approve'] };

describe('signals', () => {
  it('raises one signal for an approval, a finished run and a failed run, nothing else', () => {
    const state = play([
      env({ type: 'run.started', runId: 'r' }),
      env({ type: 'tool.start', agent: 'lead', callId: 'c', tool: 'ls', args: {} }),
      env({ type: 'approval.required', interruptId: 'i', requests: [SQL_REQUEST] }),
      env({ type: 'approval.auto', interruptId: 'j', requests: [SQL_REQUEST] }),
      env({ type: 'run.waiting', runId: 'r' }),
      env({ type: 'run.finished', runId: 'r2' }, 't2'),
      env({ type: 'run.failed', runId: 'r3', error: 'secret details' }, 't3'),
      env({ type: 'team.updated' }, '_system'),
    ]);
    expect(state.signals).toEqual<Signal[]>([
      { id: 1, threadId: 't1', kind: 'approval', agent: 'keboola-developer' },
      { id: 2, threadId: 't2', kind: 'finished', agent: '' },
      { id: 3, threadId: 't3', kind: 'failed', agent: '' },
    ]);
  });

  it('carries no tool arguments or error text', () => {
    const state = play([
      env({ type: 'approval.required', interruptId: 'i', requests: [SQL_REQUEST] }),
      env({ type: 'run.failed', runId: 'r', error: 'password=hunter2' }),
    ]);
    expect(JSON.stringify(state.signals)).not.toMatch(/SELECT|customers|hunter2|kbagent_sql/);
  });

  it('takes the first agent that asks, or none', () => {
    const state = play([
      env({ type: 'approval.required', interruptId: 'i', requests: [{ tool: 'x', args: {}, decisions: [] }, { ...SQL_REQUEST, agent: 'agent-builder' }] }),
      env({ type: 'approval.required', interruptId: 'j', requests: [{ tool: 'x', args: {}, decisions: [] }] }),
    ]);
    expect(state.signals.map((signal) => signal.agent)).toEqual(['agent-builder', '']);
  });

  it('keeps counting past the cap and returns the same list when nothing is raised', () => {
    const many = Array.from({ length: 30 }, () => env({ type: 'run.finished', runId: 'r' }));
    const signals = many.reduce<readonly Signal[]>(pushSignal, []);
    expect(signals).toHaveLength(20);
    expect(signals.map((signal) => signal.id)).toEqual(Array.from({ length: 20 }, (_, index) => index + 11));

    expect(pushSignal(signals, env({ type: 'usage', agent: 'lead', input: 1, output: 1, cached: 0 }))).toBe(signals);
  });
});
