import { describe, expect, it } from 'vitest';
import type { BusEvent, Envelope } from '../api/types.ts';
import { initialLive, reduceLive, seedFeed } from './live-state.ts';

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

  it('keeps what an action needs to be shown: its arguments and, once it ends, its result', () => {
    const state = play([
      env({ type: 'tool.start', agent: 'agent-builder', callId: 'e1', tool: 'edit_file', args: { file_path: '/agents/a/AGENT.md', old_string: 'old', new_string: 'new' } }),
      env({ type: 'tool.start', agent: 'keboola-expert', callId: 'k1', tool: 'kbagent_read', args: { args: ['config', 'list'] } }),
      env({ type: 'tool.end', agent: 'agent-builder', callId: 'e1', tool: 'edit_file', ok: true, preview: 'Edited' }),
      env({ type: 'tool.end', agent: 'x', callId: 'e1', tool: 'edit_file', ok: false, preview: 'same id, other chat' }, 't2'),
    ]);
    const edit = state.feed.find((item) => item.callId === 'e1');
    expect(edit).toMatchObject({ args: { file_path: '/agents/a/AGENT.md', old_string: 'old', new_string: 'new' }, result: { ok: true, preview: 'Edited' } });
    expect(state.feed.find((item) => item.callId === 'k1')?.result).toBeUndefined();
  });

  it('cuts very long arguments so the feed stays small', () => {
    const content = 'x'.repeat(50_000);
    const state = play([env({ type: 'tool.start', agent: 'a', callId: 'w', tool: 'write_file', args: { file_path: '/f.md', content, nested: { list: [content] } } })]);
    const args = state.feed[0]?.args as { content: string; nested: { list: string[] } };
    expect(args.content.length).toBeLessThan(6_100);
    expect(args.content.endsWith('…')).toBe(true);
    expect(args.nested.list[0]?.length).toBeLessThan(6_100);
  });

  it('records a delegation with its task, the delegate\'s answer and whether it went well', () => {
    const state = play([
      env({ type: 'delegate.start', agent: 'lead', callId: 'd1', to: 'keboola-expert', task: 'Find tables' }),
      env({ type: 'message', agent: 'keboola-expert', text: 'Found 3 tables.' }),
      env({ type: 'delegate.end', agent: 'lead', callId: 'd1', to: 'keboola-expert', ok: true }),
    ]);
    expect(state.feed[0]).toMatchObject({ kind: 'delegate', callId: 'd1', args: { task: 'Find tables' }, result: { ok: true, preview: 'Found 3 tables.' } });
  });

  it('remembers which approval to answer', () => {
    const request = { tool: 'write_file', agent: 'agent-builder', args: { file_path: '/a.md', content: 'hi' }, decisions: ['approve'] };
    const state = play([env({ type: 'approval.required', interruptId: 'i9', requests: [request] })]);
    expect(state.feed[0]).toMatchObject({ kind: 'approval', interruptId: 'i9', args: { file_path: '/a.md', content: 'hi' } });
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

describe('seedFeed', () => {
  const at = (envelope: Envelope, time: number): Envelope => ({ ...envelope, at: time });

  it('rebuilds the feed from the server activity behind the live items, with results and without duplicates', () => {
    const start = at(env({ type: 'tool.start', agent: 'keboola-expert', callId: 'e1', tool: 'edit_file', args: { file_path: '/k.md', old_string: 'a', new_string: 'b' } }), 10);
    const end = at(env({ type: 'tool.end', agent: 'keboola-expert', callId: 'e1', tool: 'edit_file', ok: true, preview: 'Updated' }), 11);
    const later = env({ type: 'tool.start', agent: 'lead', callId: 'l1', tool: 'ls', args: {} });
    const live = play([later]);
    const seeded = seedFeed(live, [start, end, later]);
    expect(seeded.feed.map((item) => item.target)).toEqual(['ls', 'edit_file']);
    expect(seeded.feed[1]).toMatchObject({ at: 10, result: { ok: true, preview: 'Updated' }, args: { file_path: '/k.md' } });
  });

  it('touches nothing but the feed', () => {
    const approval = env({ type: 'approval.required', interruptId: 'i', requests: [{ tool: 'kbagent_write', args: {}, decisions: ['approve'] }] });
    const seeded = seedFeed(initialLive(), [approval, env({ type: 'run.started', runId: 'r' })]);
    expect(seeded.feed).toHaveLength(1);
    expect(seeded).toMatchObject({ running: [], approvalsVersion: 0, signals: [] });
  });
});
