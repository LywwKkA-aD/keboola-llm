import type { OmniRouteConfig } from '../config/env.ts';

const TIMEOUT_MS = 5000;

/** Model ids OmniRoute offers, asked with the server's key; the key never leaves the server. */
export async function listModels(config: Pick<OmniRouteConfig, 'baseUrl' | 'apiKey'>, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const response = await fetchImpl(`${config.baseUrl}/models`, {
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OmniRoute answered HTTP ${response.status}`);
  const body = (await response.json()) as { data?: unknown[] };
  const ids = (body.data ?? [])
    .map((entry) => (typeof entry === 'object' && entry !== null ? (entry as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)].toSorted();
}
