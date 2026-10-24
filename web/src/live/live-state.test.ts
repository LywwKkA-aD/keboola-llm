import { describe, expect, it } from 'vitest';
import type { BusEvent, Envelope } from '../api/types.ts';
import { initialLive, reduceLive } from './live-state.ts';

let seq = 0;
const env = (event: BusEvent, threadId = 't1'): Envelope => ({ seq: ++seq, threadId, event });
const play = (events: Envelope[]) => events.reduce((state, envelope) => reduceLive(state, envelope, 100), initialLive());

describe('reduceLive', () => {
  it('tracks running and waiting chats', () => {
    const running = play([env({ type: 'run.started', runId: 'r' }), env({ type: 'run.started', runId: 'r2' }, 't2')]);
    expect(running.running).toEqual(['t1', 't2']);

    const waiting = reduceLive(running, env({ type: 'run.waiting', runId: 'r' }), 100);
    expect(waiting).toMatchObject({ running: ['t2'], waiting: ['t1'] });

    const resumed = reduceLive(waiting, env({ type: 'run.started', runId: 'r3' }), 100);
    expect(resumed).toMatchObject({ running: ['t2', 't1'], waiting: [] });

    const done = [env({ type: 'run.finished', runId: 'r3' }), env({ type: 'run.failed', runId: 'r2', error: 'x' }, 't2')].reduce(
      (state, envelope) => reduceLive(state, envelope, 100),
      resumed,
    );
    expect(done).toMatchObject({ running: [], waiting: [] });
  });

  it('keeps a newest-first feed of what agents do', () => {
    const state = play([
      env({ type: 'delegate.start', agent: 'lead', callId: 'd', to: 'keboola-expert', task: 'Find tables' }),
      env({ type: 'tool.start', agent: 'keboola-expert', callId: 't', tool: 'kbagent_read', args: { purpose: 'List buckets' } }),
      env({ type: 'approval.required', interruptId: 'i', requests: [{ tool: 'write_file', agent: 'agent-builder', args: {}, decisions: [] }] }),
      env({ type: 'approval.auto', interruptId: 'j', requests: [{ tool: 'kbagent_sql', args: { purpose: 'Count rows' }, decisions: [] }] }),
      env({ type: 'run.failed', runId: 'r', error: 'model down' }),
    ]);
    expect(state.feed.map((item) => [item.kind, item.agent, item.target, item.text])).toEqual([
      ['error', '', '', 'model down'],
      ['auto', '', 'kbagent_sql', 'Count rows'],
      ['approval', 'agent-builder', 'write_file', ''],
      ['tool', 'keboola-expert', 'kbagent_read', 'List buckets'],
      ['delegate', 'lead', 'keboola-expert', 'Find tables'],
    ]);
    expect(state.feed[0]).toMatchObject({ threadId: 't1', at: 100 });
  });

  it('caps the feed', () => {
    const many = Array.from({ length: 120 }, (_, i) => env({ type: 'tool.start', agent: 'a', callId: `c${i}`, tool: 'ls', args: {} }));
    expect(play(many).feed).toHaveLength(80);
  });

  it('bumps the usage version on every model call and the approvals version when approvals may have changed', () => {
    const state = play([
      env({ type: 'usage', agent: 'lead', input: 10, output: 2, cached: 8 }),
      env({ type: 'usage', agent: 'x', input: 5, output: 1, cached: 0 }),
      env({ type: 'approval.required', interruptId: 'i', requests: [] }),
    ]);
    expect(state.usageVersion).toBe(2);
    expect(state.approvalsVersion).toBe(1);
  });

  it('bumps the team version when agents or skills changed on disk', () => {
    const state = play([env({ type: 'team.updated' }, '_system'), env({ type: 'team.updated' }, '_system')]);
    expect(state.teamVersion).toBe(2);
    expect(state.feed).toEqual([]);
  });

  it('returns the same state for events that change nothing', () => {
    const start = initialLive();
    expect(reduceLive(start, env({ type: 'token', agent: 'lead', text: 'x' }), 1)).toBe(start);
  });
});
