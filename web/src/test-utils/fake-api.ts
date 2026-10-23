import { vi } from 'vitest';
import type { BusEvent, Envelope } from '../api/types.ts';

type Handler = (body: unknown, url: URL) => unknown;

export interface ApiCall {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
  readonly headers: HeadersInit | undefined;
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

/**
 * Replace fetch with a router keyed by "METHOD /path". A handler returns a value (sent as JSON),
 * undefined (204) or a Response. Unknown routes answer 404 like the real server.
 */
export function stubApi(routes: Record<string, Handler | unknown>) {
  const calls: ApiCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://127.0.0.1:4800');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, path: url.pathname, body, headers: init?.headers });
    const key = `${method} ${url.pathname}`;
    if (!(key in routes)) return json({ error: 'Not found' }, 404);
    const route = routes[key];
    const result = typeof route === 'function' ? (route as Handler)(body, url) : route;
    if (result instanceof Response) return result;
    return result === undefined ? new Response(null, { status: 204 }) : json(result);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock, callsTo: (method: string, path: string) => calls.filter((call) => call.method === method && call.path === path) };
}

export const errorResponse = (status: number, error: string) => json({ error }, status);

/** EventSource stand-in: tests push server events into the latest instance. */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  onmessage: ((message: MessageEvent<string>) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private seq = 0;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  emit(event: BusEvent, threadId = new URL(this.url, 'http://x').searchParams.get('threadId') ?? 't1'): void {
    this.seq += 1;
    const envelope: Envelope = { seq: this.seq, threadId, event };
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(envelope) }));
  }

  close(): void {
    this.closed = true;
  }

  /** Simulate the connection opening or dropping. */
  open(): void {
    this.onopen?.();
  }

  fail(): void {
    this.onerror?.();
  }

  /** The latest stream of one chat (the app also keeps a global stream open). */
  static forThread(threadId: string): FakeEventSource {
    const source = FakeEventSource.instances.filter((entry) => entry.url.includes(`threadId=${encodeURIComponent(threadId)}`)).at(-1);
    if (!source) throw new Error(`No EventSource for thread ${threadId}`);
    return source;
  }

  /** The latest all-chats stream that drives the top bar and the aquarium. */
  static global(): FakeEventSource {
    const source = FakeEventSource.instances.filter((entry) => !entry.url.includes('threadId=')).at(-1);
    if (!source) throw new Error('No global EventSource was opened');
    return source;
  }

  static latest(): FakeEventSource {
    const source = FakeEventSource.instances.at(-1);
    if (!source) throw new Error('No EventSource was opened');
    return source;
  }
}

export function stubEventSource(): typeof FakeEventSource {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  return FakeEventSource;
}
