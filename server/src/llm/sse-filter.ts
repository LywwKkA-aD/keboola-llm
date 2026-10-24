/**
 * OmniRoute sends keepalive chunks while a model is thinking: chat.completion.chunk events with an empty
 * delta and no role. LangChain turns a role-less first chunk into a generic ChatMessage and the agent
 * then fails with "expected AIMessage". These events carry no information, so drop them on the wire.
 * The usage chunk is rewritten the OpenAI way on the same pass (see usage-normalize.ts).
 */
import { normalizeUsageEvent } from './usage-normalize.ts';

const EVENT_BOUNDARY = /\r?\n\r?\n/;

interface Choice {
  readonly delta?: Record<string, unknown>;
  readonly finish_reason?: string | null;
}

const isEmptyChoice = (choice: Choice) =>
  Object.keys(choice.delta ?? {}).length === 0 && (choice.finish_reason ?? null) === null;

/** True for SSE events that carry nothing: comments, pings and chunks whose choices are all empty. */
export function isNoopEvent(event: string): boolean {
  const lines = event.split(/\r?\n/).filter(Boolean);
  if (lines.every((line) => line.startsWith(':'))) return true;
  if (lines.some((line) => /^event:\s*ping$/.test(line))) return true;

  const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('');
  try {
    const parsed = JSON.parse(data) as { choices?: Choice[]; usage?: unknown };
    return Array.isArray(parsed.choices) && parsed.choices.length > 0 && !parsed.usage && parsed.choices.every(isEmptyChoice);
  } catch {
    return false;
  }
}

function createNoopFilter(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  const emit = (event: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    if (event.trim() && !isNoopEvent(event)) controller.enqueue(encoder.encode(`${normalizeUsageEvent(event)}\n\n`));
  };

  return new TransformStream({
    transform(bytes, controller) {
      const events = (buffer + decoder.decode(bytes, { stream: true })).split(EVENT_BOUNDARY);
      buffer = events.pop() ?? '';
      events.forEach((event) => emit(event, controller));
    },
    flush(controller) {
      emit(buffer + decoder.decode(), controller);
    },
  });
}

/** Wrap a fetch implementation so SSE responses come back without no-op events and with OpenAI-style usage. */
export function withoutNoopChunks(fetchImpl: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    const isSse = (response.headers.get('content-type') ?? '').includes('text/event-stream');
    if (!isSse || !response.body) return response;
    // The filtered body is shorter, so a copied Content-Length would be wrong.
    const headers = new Headers([...response.headers].filter(([name]) => name.toLowerCase() !== 'content-length'));
    return new Response(response.body.pipeThrough(createNoopFilter()), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
