import { describe, expect, it } from 'vitest';
import { createEventBus } from './bus.ts';
import { createActivityLog } from './activity.ts';

describe('activity log', () => {
  it('keeps what the team did across chats, oldest first, without tokens and usage', () => {
    const bus = createEventBus({ historyPerThread: 100 });
    const log = createActivityLog(bus, { limit: 10 });
    bus.publish('t1', { type: 'token', agent: 'lead', text: 'x' });
    bus.publish('t1', { type: 'tool.start', agent: 'lead', callId: 'c1', tool: 'read_file', args: { file_path: '/a.md' } });
    bus.publish('t2', { type: 'delegate.start', agent: 'lead', callId: 'd1', to: 'keboola-expert', task: 'Find tables' });
    bus.publish('t1', { type: 'usage', agent: 'lead', input: 1, output: 1, cached: 0, cacheWrite: 0 });
    bus.publish('t1', { type: 'tool.end', agent: 'lead', callId: 'c1', tool: 'read_file', ok: true, preview: 'text' });
    expect(log.list().map(({ threadId, event }) => `${threadId}:${event.type}`)).toEqual(['t1:tool.start', 't2:delegate.start', 't1:tool.end']);
  });

  it('keeps only the newest entries and cuts long strings', () => {
    const bus = createEventBus({ historyPerThread: 100 });
    const log = createActivityLog(bus, { limit: 2, maxText: 5 });
    bus.publish('t1', { type: 'tool.start', agent: 'a', callId: '1', tool: 'write_file', args: { content: 'abcdefgh', nested: { list: ['123456'] } } });
    bus.publish('t1', { type: 'tool.end', agent: 'a', callId: '1', tool: 'write_file', ok: true, preview: 'ok' });
    bus.publish('t1', { type: 'message', agent: 'keboola-expert', text: 'a long answer' });
    const entries = log.list();
    expect(entries).toHaveLength(2);
    expect(entries[1]?.event).toEqual({ type: 'message', agent: 'keboola-expert', text: 'a lon…' });
  });

  it('cuts tool arguments deep inside', () => {
    const bus = createEventBus({ historyPerThread: 100 });
    const log = createActivityLog(bus, { limit: 5, maxText: 3 });
    bus.publish('t1', { type: 'tool.start', agent: 'a', callId: '1', tool: 'x', args: { a: 'abcdef', b: { c: ['wxyz', 1] } } });
    expect(log.list()[0]?.event).toMatchObject({ args: { a: 'abc…', b: { c: ['wxy…', 1] } } });
  });
});
