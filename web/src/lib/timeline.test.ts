import { describe, expect, it } from 'vitest';
import type { ChatEntry } from '../api/types.ts';
import type { Activity } from '../state/run-state.ts';
import { timeline } from './timeline.ts';

const user = (id: string): ChatEntry => ({ id, role: 'user', text: id });
const reply = (id: string): ChatEntry => ({ id, role: 'assistant', text: id });
const step = (id: string, turn: number): Activity => ({ id, turn, kind: 'tool', agent: 'a', target: 'ls', label: id, status: 'done', startedAt: 0 });
const shape = (items: ReturnType<typeof timeline>) =>
  items.map((item) => (item.kind === 'entry' ? item.entry.id : `steps:${item.steps.map((s) => s.id).join(',')}`));

describe('timeline', () => {
  it('puts the steps of a turn between the message that started it and the reply', () => {
    const items = timeline([user('q1'), reply('a1')], [step('s1', 0), step('s2', 0)], 1);
    expect(shape(items)).toEqual(['q1', 'steps:s1,s2', 'a1']);
  });

  it('aligns turns to the latest messages, so a replay that missed older turns still lands right', () => {
    const history = [user('q1'), reply('a1'), user('q2'), reply('a2'), user('q3')];
    // Only the last two turns were seen (e.g. the server restarted after q1).
    const items = timeline(history, [step('s2', 0), step('s3', 1)], 2);
    expect(shape(items)).toEqual(['q1', 'a1', 'q2', 'steps:s2', 'a2', 'q3', 'steps:s3']);
  });

  it('keeps turns without a message yet at the end, and skips turns without steps', () => {
    expect(shape(timeline([], [step('s1', 0)], 1))).toEqual(['steps:s1']);
    expect(shape(timeline([user('q1'), reply('a1')], [], 1))).toEqual(['q1', 'a1']);
    expect(shape(timeline([user('q1')], [step('s2', 1)], 2))).toEqual(['q1', 'steps:s2']);
  });
});
