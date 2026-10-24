/**
 * Which failed model calls deserve another attempt. OmniRoute answers 429 while a provider is rate limited
 * and 5xx while one is down, and the connection itself can drop: those are transient and retried with
 * backoff. Auth, validation and missing-model errors (other 4xx) are permanent and fail at once.
 */

export type ModelErrorKind = 'transient' | 'permanent';

/** A longer Retry-After than this is not waited out: the run fails and the user can continue later. */
export const MAX_RETRY_AFTER_MS = 60_000;

type Rec = Record<string, unknown>;

const isRec = (value: unknown): value is Rec => typeof value === 'object' && value !== null;

// Socket-level failures as Node, undici and the OpenAI client report them.
const CONNECTION_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);
const CONNECTION_NAMES = new Set(['APIConnectionError', 'APIConnectionTimeoutError', 'TimeoutError', 'ConnectTimeoutError', 'SocketError']);
const CONNECTION_MESSAGES = /^(fetch failed|terminated|other side closed)/i;
const MAX_CAUSES = 8;

/** The error and the errors it wraps (cause), outermost first. */
function causes(error: unknown): Rec[] {
  const found: Rec[] = [];
  let current = error;
  while (isRec(current) && found.length < MAX_CAUSES) {
    found.push(current);
    current = current.cause;
  }
  return found;
}

// The OpenAI client's error classes keep the name "Error"; their class name says what happened.
const nameOf = (error: Rec): string => {
  if (typeof error.name === 'string' && error.name !== 'Error') return error.name;
  return typeof error.constructor === 'function' ? error.constructor.name : '';
};
const messageOf = (error: Rec): string => (typeof error.message === 'string' ? error.message : '');

const isAbort = (error: Rec) => error.name === 'AbortError' || /^(AbortError|Cancel)/.test(messageOf(error));

const isConnectionError = (error: Rec) =>
  (typeof error.code === 'string' && CONNECTION_CODES.has(error.code)) ||
  CONNECTION_NAMES.has(nameOf(error)) ||
  (error instanceof TypeError && CONNECTION_MESSAGES.test(messageOf(error)));

const statusOf = (error: Rec): number | undefined => {
  if (typeof error.status === 'number') return error.status;
  return isRec(error.response) && typeof error.response.status === 'number' ? error.response.status : undefined;
};

const quotaExhausted = (error: Rec) => error.code === 'insufficient_quota' || (isRec(error.error) && error.error.code === 'insufficient_quota');

/** The OpenAI client's APIError for an error event inside a stream: no status, the payload in .error. */
const isStreamError = (error: Rec) => 'status' in error && error.status === undefined && isRec(error.error);

// The agent's middleware wraps a failed model call in its own error, with the original as the cause.
const isWrapper = (error: Rec) => nameOf(error) === 'MiddlewareError';

/** Transient, permanent, or undefined for errors that did not come from talking to the model (and aborts). */
export function modelErrorKind(error: unknown): ModelErrorKind | undefined {
  const chain = causes(error).filter((entry) => !isWrapper(entry));
  const outer = chain[0];
  if (!outer || isAbort(outer)) return undefined;
  const status = statusOf(outer);
  if (status !== undefined) {
    if (quotaExhausted(outer)) return 'permanent';
    return status === 408 || status === 429 || status >= 500 ? 'transient' : 'permanent';
  }
  if (isStreamError(outer)) return 'transient';
  return chain.some(isConnectionError) ? 'transient' : undefined;
}

function headerOf(error: unknown, name: string): string | undefined {
  if (!isRec(error) || !isRec(error.headers)) return undefined;
  const { headers } = error;
  const value = typeof headers.get === 'function' ? (headers.get as (key: string) => unknown)(name) : headers[name];
  return typeof value === 'string' ? value : undefined;
}

/** How long the server asked to wait (Retry-After, in seconds or as a date), in ms. */
export function retryAfterMs(error: unknown): number | undefined {
  const value = headerOf(error, 'retry-after')?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

/**
 * ChatOpenAI's hook after each failed attempt (LangChain's AsyncCaller): returning lets it retry with
 * exponential backoff, throwing ends the call with that error.
 */
export function onFailedAttempt(error: unknown): void {
  if (modelErrorKind(error) !== 'transient') throw error;
  const wait = retryAfterMs(error);
  if (wait === undefined) return;
  if (wait > MAX_RETRY_AFTER_MS) throw error;
  // The retry library reads this field from the error and waits at least that long.
  Object.assign(error as object, { retryAfterMs: wait });
}
