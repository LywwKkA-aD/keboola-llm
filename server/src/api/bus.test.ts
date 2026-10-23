import { describe, expect, it } from 'vitest';
import { createEventBus } from './bus.ts';

const token = (text: string) => ({ type: 'token', agent: 'lead', text }) as const;

describe('createEventBus', () => {
  it('delivers events to matching subscribers with increasing sequence numbers', () => {
    const bus = createEventBus({ historyPerThread: 10 });
    const seen: unknown[] = [];
    bus.subscribe((envelope) => seen.push(envelope), { threadId: 't1' });

    bus.publish('t1', token('a'));
    bus.publish('t2', token('b'));
    bus.publish('t1', token('c'));

    expect(seen).toEqual([
      { seq: 1, threadId: 't1', event: token('a') },
      { seq: 3, threadId: 't1', event: token('c') },
    ]);
  });

  it('delivers every thread to a global subscriber', () => {
    const bus = createEventBus({ historyPerThread: 10 });
    const seen: string[] = [];
    bus.subscribe((envelope) => seen.push(envelope.threadId));
    bus.publish('t1', token('a'));
    bus.publish('t2', token('b'));
    expect(seen).toEqual(['t1', 't2']);
  });

  it('replays recent events after a given sequence number', () => {
    const bus = createEventBus({ historyPerThread: 2 });
    bus.publish('t1', token('a'));
    bus.publish('t1', token('b'));
    bus.publish('t1', token('c'));

    expect(bus.history('t1', 0).map((envelope) => envelope.seq)).toEqual([2, 3]);
    expect(bus.history('t1', 2).map((envelope) => envelope.seq)).toEqual([3]);
    expect(bus.history('nope', 0)).toEqual([]);
  });

  it('stops delivering after unsubscribe and survives a throwing subscriber', () => {
    const bus = createEventBus({ historyPerThread: 10 });
    const seen: number[] = [];
    bus.subscribe(() => {
      throw new Error('bad listener');
    });
    const unsubscribe = bus.subscribe((envelope) => seen.push(envelope.seq));
    bus.publish('t1', token('a'));
    unsubscribe();
    bus.publish('t1', token('b'));
    expect(seen).toEqual([1]);
  });
});
