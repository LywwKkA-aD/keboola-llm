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
    .filter((entry): entry is ModelEntry => typeof entry === 'object' && entry !== null && runsAgents(entry as ModelEntry))
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)].toSorted();
}

interface ModelEntry {
  readonly id?: unknown;
  readonly type?: unknown;
  readonly output_modalities?: unknown;
  readonly capabilities?: { readonly tool_calling?: unknown };
}

/**
 * Agents need a model that answers in text and calls tools. OmniRoute also lists image, video, audio and embedding
 * models; when it says nothing about a field, the model gets the benefit of the doubt.
 */
function runsAgents(entry: ModelEntry): boolean {
  if (typeof entry.type === 'string' && entry.type !== 'chat' && entry.type !== 'text') return false;
  if (Array.isArray(entry.output_modalities) && !entry.output_modalities.includes('text')) return false;
  return entry.capabilities?.tool_calling !== false;
}
