import type { FastifyInstance } from 'fastify';
import type { Envelope } from '../bus.ts';
import { eventsQuery } from '../schemas.ts';
import type { ServerDeps } from '../types.ts';

const PING_MS = 15_000;

/**
 * Server-sent events. With ?threadId= the stream carries one chat (and replays what the client
 * missed, via ?after= or the Last-Event-ID header on reconnect); without it, every thread, which
 * is what the aquarium listens to.
 */
export function registerEventRoutes(app: FastifyInstance, { bus }: ServerDeps): void {
  app.get('/api/events', (request, reply) => {
    const { threadId, after } = eventsQuery.parse(request.query);
    const lastEventId = Number(request.headers['last-event-id']);
    const since = Number.isFinite(lastEventId) ? lastEventId : (after ?? 0);

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const send = (envelope: Envelope) => res.write(`id: ${envelope.seq}\ndata: ${JSON.stringify(envelope)}\n\n`);

    if (threadId) bus.history(threadId, since).forEach(send);
    const unsubscribe = bus.subscribe(send, threadId ? { threadId } : {});
    const ping = setInterval(() => res.write(': ping\n\n'), PING_MS);
    request.raw.on('close', () => {
      clearInterval(ping);
      unsubscribe();
    });
  });
}
