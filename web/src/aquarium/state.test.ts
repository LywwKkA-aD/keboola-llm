import { describe, expect, it } from 'vitest';
import type { Envelope } from '../api/types.ts';
import { activityForTool, initialAquarium, moodOf, reduceAquarium } from './state.ts';

let seq = 0;
const env = (event: Envelope['event'], threadId = 't1'): Envelope => ({ seq: ++seq, threadId, event });
const at = 1_000;

const play = (envelopes: Envelope[], now = at) =>
  envelopes.reduce((state, envelope) => reduceAquarium(state, envelope, now), initialAquarium('lead'));

describe('activityForTool', () => {
  it.each([
    ['read_file', { file_path: '/skills/cli-kbagent/kbagent/SKILL.md' }, 'reading'],
    ['grep', { path: '/knowledge' }, 'reading'],
    ['ls', {}, 'reading'],
    ['write_file', { file_path: '/agents/x/AGENT.md' }, 'writing'],
    ['edit_file', { file_path: '/memories/AGENTS.md' }, 'writing'],
    ['kbagent_read', { purpose: 'List configs' }, 'computing'],
    ['kbagent_sql', {}, 'querying'],
    ['kbagent_write', {}, 'computing'],
    ['write_todos', {}, 'planning'],
    ['request_plan_approval', { summary: 'Plan' }, 'planning'],
    ['something_else', {}, 'working'],
  ])('%s -> %s', (tool, args, expected) => {
    expect(activityForTool(tool, args)).toBe(expected);
  });
});

describe('reduceAquarium', () => {
  it('wakes the lead when a run starts', () => {
    expect(play([env({ type: 'run.started', runId: 'r' })]).agents.lead).toMatchObject({ activity: 'thinking', threadId: 't1' });
  });

  it('sends a subagent to the right station and back to thinking after the tool', () => {
    const working = play([
      env({ type: 'delegate.start', agent: 'lead', callId: 'd', to: 'keboola-expert', task: 'Find tables' }),
      env({ type: 'tool.start', agent: 'keboola-expert', callId: 't', tool: 'kbagent_read', args: { purpose: 'List buckets' } }),
    ]);
    expect(working.agents.lead).toMatchObject({ activity: 'delegating', label: 'Find tables', partner: 'keboola-expert' });
    expect(working.agents['keboola-expert']).toMatchObject({ activity: 'computing', label: 'List buckets' });

    const after = reduceAquarium(working, env({ type: 'tool.end', agent: 'keboola-expert', callId: 't', tool: 'kbagent_read', ok: true, preview: '' }), at);
    expect(after.agents['keboola-expert']?.activity).toBe('thinking');
  });

  it('remembers the station of the task while the agent thinks between tool calls', () => {
    const state = play([
      env({ type: 'delegate.start', agent: 'lead', callId: 'd', to: 'keboola-expert', task: 'Find tables' }),
      env({ type: 'tool.start', agent: 'keboola-expert', callId: 't', tool: 'kbagent_read', args: {} }),
      env({ type: 'tool.end', agent: 'keboola-expert', callId: 't', tool: 'kbagent_read', ok: true, preview: '' }),
      env({ type: 'token', agent: 'keboola-expert', text: 'Found two' }),
    ]);
    expect(state.agents['keboola-expert']).toMatchObject({ activity: 'thinking', work: 'computing' });

    const done = reduceAquarium(state, env({ type: 'delegate.end', agent: 'lead', callId: 'd', to: 'keboola-expert', ok: true }), at);
    expect(done.agents['keboola-expert']?.activity).toBe('idle');
    expect(done.agents['keboola-expert']?.work).toBeUndefined();
  });

  it('lets a finished subagent rest and the lead think again', () => {
    const state = play([
      env({ type: 'delegate.start', agent: 'lead', callId: 'd', to: 'helper', task: 'x' }),
      env({ type: 'delegate.end', agent: 'lead', callId: 'd', to: 'helper', ok: true }),
    ]);
    expect(state.agents.helper?.activity).toBe('idle');
    expect(state.agents.lead?.activity).toBe('thinking');
  });

  it('puts the agent that asked for approval at the bell', () => {
    const state = play([
      env({ type: 'tool.start', agent: 'agent-builder', callId: 'w', tool: 'write_file', args: { file_path: '/agents/a/AGENT.md' } }),
      env({ type: 'approval.required', interruptId: 'i', requests: [{ tool: 'write_file', args: {}, decisions: ['approve'] }] }),
    ]);
    expect(state.agents['agent-builder']?.activity).toBe('waiting');
  });

  it('streams tokens as thinking without overriding a waiting agent', () => {
    const thinking = play([env({ type: 'token', agent: 'helper', text: 'hm' })]);
    expect(thinking.agents.helper?.activity).toBe('thinking');

    const waiting = play([
      env({ type: 'tool.start', agent: 'helper', callId: 'w', tool: 'write_file', args: {} }),
      env({ type: 'approval.required', interruptId: 'i', requests: [{ tool: 'write_file', args: {}, decisions: [] }] }),
      env({ type: 'token', agent: 'helper', text: 'x' }),
    ]);
    expect(waiting.agents.helper?.activity).toBe('waiting');
  });

  it('sends the approved agent on to the station of its tool when the run resumes, the lead still delegating', () => {
    const resumed = play([
      env({ type: 'run.started', runId: 'r1' }),
      env({ type: 'delegate.start', agent: 'lead', callId: 'd', to: 'keboola-developer', task: 'Fix the join' }),
      env({ type: 'tool.start', agent: 'keboola-developer', callId: 'w', tool: 'kbagent_write', args: { purpose: 'Run the job' } }),
      env({ type: 'approval.required', interruptId: 'i', requests: [{ tool: 'kbagent_write', args: {}, decisions: ['approve'] }] }),
      env({ type: 'run.waiting', runId: 'r1' }),
      env({ type: 'run.started', runId: 'r2', resume: true }),
    ]);
    expect(resumed.agents['keboola-developer']).toMatchObject({ activity: 'computing', work: 'computing' });
    expect(resumed.agents.lead).toMatchObject({ activity: 'delegating', partner: 'keboola-developer' });

    const thinking = reduceAquarium(resumed, env({ type: 'token', agent: 'keboola-developer', text: 'done' }), at);
    expect(thinking.agents['keboola-developer']).toMatchObject({ activity: 'thinking', work: 'computing' });
  });

  it('wakes the lead when a stopped run is continued', () => {
    const state = play([
      env({ type: 'run.started', runId: 'r1' }),
      env({ type: 'run.failed', runId: 'r1', error: 'x' }),
      env({ type: 'run.started', runId: 'r2', resume: true }),
    ]);
    expect(state.agents.lead).toMatchObject({ activity: 'thinking' });
  });

  it('leaves agents waiting in other chats alone when a run resumes', () => {
    const state = play([
      env({ type: 'tool.start', agent: 'helper', callId: 'w', tool: 'write_file', args: {} }, 't2'),
      env({ type: 'approval.required', interruptId: 'i', requests: [{ tool: 'write_file', args: {}, decisions: [] }] }, 't2'),
      env({ type: 'run.started', runId: 'r', resume: true }, 't1'),
    ]);
    expect(state.agents.helper?.activity).toBe('waiting');
  });

  it('sends everyone from the finished thread to rest, but not agents busy elsewhere', () => {
    const state = play([
      env({ type: 'token', agent: 'lead', text: 'a' }, 't1'),
      env({ type: 'token', agent: 'helper', text: 'b' }, 't2'),
      env({ type: 'run.finished', runId: 'r' }, 't1'),
    ]);
    expect(state.agents.lead?.activity).toBe('idle');
    expect(state.agents.helper?.activity).toBe('thinking');
  });

  it('marks agents of a failed run as inked', () => {
    const state = play([env({ type: 'token', agent: 'lead', text: 'a' }), env({ type: 'run.failed', runId: 'r', error: 'x' })]);
    expect(state.agents.lead).toMatchObject({ activity: 'error', since: at });
  });

  it('ignores events that do not change anyone', () => {
    const start = initialAquarium('lead');
    expect(reduceAquarium(start, env({ type: 'usage', agent: 'lead', input: 1, output: 1, cached: 0 }), at)).toBe(start);
  });
});

describe('moodOf', () => {
  it('lets the ink cloud fade after a few seconds', () => {
    const agent = { activity: 'error' as const, label: '', since: 0, threadId: 't' };
    expect(moodOf(agent, 1000)).toBe('error');
    expect(moodOf(agent, 10_000)).toBe('idle');
    expect(moodOf(undefined, 0)).toBe('idle');
  });
});
