import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEventBus, type Envelope, type EventBus } from '../bus.ts';
import type { ServerDeps } from '../types.ts';
import { registerEventRoutes } from './events.ts';

const token = (text: string) => ({ type: 'token', agent: 'lead', text }) as const;

interface Stream {
  readonly response: Response;
  readonly take: (count: number) => Promise<Array<Envelope & { id: string }>>;
  readonly close: () => void;
}

let app: FastifyInstance | undefined;
const openStreams: Stream[] = [];

afterEach(async () => {
  openStreams.splice(0).forEach((stream) => stream.close());
  await app?.close();
  app = undefined;
});

async function start(bus: EventBus): Promise<string> {
  app = Fastify({ forceCloseConnections: true });
  registerEventRoutes(app, { bus } as ServerDeps);
  await app.listen({ host: '127.0.0.1', port: 0 });
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

/** Open an SSE stream and read envelopes off it frame by frame. */
async function open(url: string, headers: Record<string, string> = {}): Promise<Stream> {
  const controller = new AbortController();
  const response = await fetch(url, { headers, signal: controller.signal });
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const queue: Array<Envelope & { id: string }> = [];

  const take = async (count: number) => {
    while (queue.length < count) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      frames.forEach((frame) => {
        const lines = frame.split('\n');
        const data = lines.find((line) => line.startsWith('data: '));
        const id = lines.find((line) => line.startsWith('id: '));
        if (data) queue.push({ ...(JSON.parse(data.slice(6)) as Envelope), id: id?.slice(4) ?? '' });
      });
    }
    return queue.splice(0, count);
  };

  const stream = { response, take, close: () => controller.abort() };
  openStreams.push(stream);
  return stream;
}

describe('GET /api/events', () => {
  it('answers with an event stream', async () => {
    const base = await start(createEventBus({ historyPerThread: 10 }));
    const stream = await open(`${base}/api/events?threadId=t1`);
    expect(stream.response.status).toBe(200);
    expect(stream.response.headers.get('content-type')).toMatch(/^text\/event-stream/);
  });

  it('sends a first byte at once so buffering proxies (e.g. the Vite dev proxy) pass the stream on', async () => {
    const base = await start(createEventBus({ historyPerThread: 10 }));
    const controller = new AbortController();
    const response = await fetch(`${base}/api/events`, { signal: controller.signal });
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const first = await Promise.race([reader.read(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000))]);
    controller.abort();
    expect(first && new TextDecoder().decode(first.value)).toMatch(/^: connected\n\n/);
  });

  it('replays the thread after ?after= and then delivers that thread live', async () => {
    const bus = createEventBus({ historyPerThread: 10 });
    bus.publish('t1', token('a'));
    bus.publish('t1', token('b'));
    bus.publish('t2', token('other thread'));
    const base = await start(bus);

    const stream = await open(`${base}/api/events?threadId=t1&after=1`);
    const [replayed] = await stream.take(1);
    expect(replayed).toMatchObject({ seq: 2, id: '2', threadId: 't1', event: token('b') });

    bus.publish('t2', token('still other'));
    bus.publish('t1', token('c'));
    const [live] = await stream.take(1);
    expect(live).toMatchObject({ threadId: 't1', event: token('c') });
  });

  it('prefers the Last-Event-ID header of a reconnecting browser over ?after=', async () => {
    const bus = createEventBus({ historyPerThread: 10 });
    ['a', 'b', 'c'].forEach((text) => bus.publish('t1', token(text)));
    const base = await start(bus);

    const stream = await open(`${base}/api/events?threadId=t1&after=0`, { 'last-event-id': '2' });
    const [first] = await stream.take(1);
    expect(first?.seq).toBe(3);
  });

  it('ignores an empty Last-Event-ID header and keeps ?after=', async () => {
    const bus = createEventBus({ historyPerThread: 10 });
    ['a', 'b', 'c'].forEach((text) => bus.publish('t1', token(text)));
    const base = await start(bus);

    const stream = await open(`${base}/api/events?threadId=t1&after=2`, { 'last-event-id': '' });
    const [first] = await stream.take(1);
    expect(first?.seq).toBe(3);
  });

  it('streams every thread without replay when no thread is given', async () => {
    const bus = createEventBus({ historyPerThread: 10 });
    bus.publish('t1', token('old'));
    const base = await start(bus);

    const stream = await open(`${base}/api/events`);
    bus.publish('t2', token('x'));
    bus.publish('t1', token('y'));
    const envelopes = await stream.take(2);
    expect(envelopes.map((envelope) => envelope.threadId)).toEqual(['t2', 't1']);
    expect(envelopes.every((envelope) => envelope.event.type === 'token' && envelope.event.text !== 'old')).toBe(true);
  });

  it('unsubscribes when the client goes away', async () => {
    const bus = createEventBus({ historyPerThread: 10 });
    const unsubscribed = vi.fn();
    const spyBus: EventBus = {
      ...bus,
      subscribe: (listener, filter) => {
        const off = bus.subscribe(listener, filter);
        return () => {
          unsubscribed();
          off();
        };
      },
    };
    const base = await start(spyBus);

    const stream = await open(`${base}/api/events?threadId=t1`);
    expect(unsubscribed).not.toHaveBeenCalled();
    stream.close();
    await vi.waitFor(() => expect(unsubscribed).toHaveBeenCalledTimes(1));
  });
});
