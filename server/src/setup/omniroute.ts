/** Talk to OmniRoute for the setup checks: is it there, does it take the key, does the model answer. */
import type { OmniRouteConfig } from '../config/env.ts';
import { agentModels, type CatalogModel } from '../system/models.ts';

const PROBE_TIMEOUT_MS = 5000;
const TEST_TIMEOUT_MS = 30_000;
const MAX_ERROR_CHARS = 300;
const REDACTED = '[redacted]';

export interface OmniRouteProbe {
  /** False when nothing answered at the base URL. */
  readonly reachable: boolean;
  readonly status?: number;
  /** Models that can run agents, sorted, with their provider; empty unless the answer was OK. */
  readonly models?: readonly CatalogModel[];
  /** Why it was not reachable, e.g. ECONNREFUSED. */
  readonly error?: string;
}

export interface ModelTestResult {
  readonly ok: boolean;
  readonly model: string;
  readonly latencyMs: number;
  /** One line, never carrying the key. */
  readonly error?: string;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Blank the key and anything that looks like a credential in text meant for the UI or the terminal. */
export function redactSecret(text: string, secret: string): string {
  const withoutKey = secret ? text.replace(new RegExp(escape(secret), 'g'), REDACTED) : text;
  return withoutKey
    .replace(/(Bearer\s+)\S+/gi, `$1${REDACTED}`)
    .replace(/\b(?:sk|pk|rk)-[\w-]{6,}/g, REDACTED);
}

const headersFor = (apiKey: string): Record<string, string> => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {});

/** Network-level reason a request failed: the cause's code (ECONNREFUSED, ENOTFOUND) or the message. */
function networkError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && error.name === 'TimeoutError') return `No answer within ${Math.round(timeoutMs / 1000)} s`;
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  if (typeof cause?.code === 'string') return cause.code;
  return error instanceof Error ? error.message : String(error);
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR_CHARS);

async function upstreamError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  let message = text;
  try {
    const body = JSON.parse(text) as { error?: { message?: unknown } | string; message?: unknown };
    const candidate = typeof body.error === 'string' ? body.error : (body.error?.message ?? body.message);
    if (typeof candidate === 'string') message = candidate;
  } catch {
    // Not JSON: keep the text.
  }
  return message.trim() ? `HTTP ${response.status}: ${message}` : `HTTP ${response.status}`;
}

/** GET /models with the key, if there is one. Never throws. */
export async function probeOmniRoute(config: Pick<OmniRouteConfig, 'baseUrl' | 'apiKey'>, fetchImpl: typeof fetch = fetch): Promise<OmniRouteProbe> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}/models`, { headers: headersFor(config.apiKey), signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  } catch (error) {
    return { reachable: false, error: redactSecret(oneLine(networkError(error, PROBE_TIMEOUT_MS)), config.apiKey) };
  }
  if (!response.ok) return { reachable: true, status: response.status, models: [] };
  // Only models that can run agents, like the model pickers elsewhere (no image, video, audio or embedding models).
  return { reachable: true, status: response.status, models: agentModels(await response.json().catch(() => ({}))) };
}

/**
 * Send "Reply with OK" to the model through OmniRoute, the way the team would (no token limits, which
 * some reasoning models reject). OK means the model answered at all; the reply itself does not matter.
 */
export async function testModel(
  config: OmniRouteConfig,
  { fetchImpl = fetch, now = () => performance.now(), timeoutMs = TEST_TIMEOUT_MS }: { fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number } = {},
): Promise<ModelTestResult> {
  const started = now();
  const result = (ok: boolean, error?: string): ModelTestResult => ({
    ok,
    model: config.model,
    latencyMs: Math.round(now() - started),
    ...(error === undefined ? {} : { error: redactSecret(oneLine(error), config.apiKey) }),
  });
  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { ...headersFor(config.apiKey), 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: 'Reply with OK' }], stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return result(false, await upstreamError(response));
    const body = (await response.json().catch(() => ({}))) as { choices?: unknown };
    return Array.isArray(body.choices) && body.choices.length > 0 ? result(true) : result(false, 'OmniRoute answered without a reply');
  } catch (error) {
    return result(false, networkError(error, timeoutMs));
  }
}
