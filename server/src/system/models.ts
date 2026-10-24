import type { OmniRouteConfig } from '../config/env.ts';

const TIMEOUT_MS = 5000;

/** A model OmniRoute offers and the provider it belongs to (its owned_by, e.g. "claude"). */
export interface CatalogModel {
  readonly id: string;
  readonly provider: string;
}

export interface ModelEntry {
  readonly id?: unknown;
  readonly type?: unknown;
  readonly owned_by?: unknown;
  readonly output_modalities?: unknown;
  readonly capabilities?: { readonly tool_calling?: unknown };
}

/**
 * Agents need a model that answers in text and calls tools. OmniRoute also lists image, video, audio and embedding
 * models; when it says nothing about a field, the model gets the benefit of the doubt.
 */
export function runsAgents(entry: ModelEntry): boolean {
  if (typeof entry.type === 'string' && entry.type !== 'chat' && entry.type !== 'text') return false;
  if (Array.isArray(entry.output_modalities) && !entry.output_modalities.includes('text')) return false;
  return entry.capabilities?.tool_calling !== false;
}

/** The models that can run agents in an OmniRoute /models answer, sorted, each id once. */
export function agentModels(body: unknown): CatalogModel[] {
  const data = typeof body === 'object' && body !== null && Array.isArray((body as { data?: unknown }).data) ? ((body as { data: unknown[] }).data) : [];
  const models = data
    .filter((entry): entry is ModelEntry => typeof entry === 'object' && entry !== null && runsAgents(entry as ModelEntry))
    .flatMap((entry) => (typeof entry.id === 'string' && entry.id ? [{ id: entry.id, provider: typeof entry.owned_by === 'string' ? entry.owned_by : '' }] : []));
  const first = models.filter((model, index) => models.findIndex((other) => other.id === model.id) === index);
  return first.toSorted((a, b) => a.id.localeCompare(b.id));
}

const prefixOf = (id: string) => (id.includes('/') ? id.slice(0, id.indexOf('/') + 1) : '');

/**
 * The models the team should see: those of the provider behind the default model, under the same id prefix
 * (cc/claude-... but not the claude/ aliases or no-think/ variants of the same models). OmniRoute also lists keyless
 * free providers and combos that the analyst never connected, and its key cannot list the connections, so the default
 * model stands for what is connected. Without a default model, or with a combo as default, every model.
 */
export function modelsOfProvider(models: readonly CatalogModel[], model: string): readonly CatalogModel[] {
  const chosen = models.find((entry) => entry.id === model);
  if (!chosen || !chosen.provider || chosen.provider === 'combo') return models;
  const prefix = prefixOf(model);
  return models.filter((entry) => entry.provider === chosen.provider && entry.id.startsWith(prefix));
}

/** Model ids OmniRoute offers, asked with the server's key; the key never leaves the server. */
export async function listModels(config: Pick<OmniRouteConfig, 'baseUrl' | 'apiKey'>, fetchImpl: typeof fetch = fetch): Promise<CatalogModel[]> {
  const response = await fetchImpl(`${config.baseUrl}/models`, {
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OmniRoute answered HTTP ${response.status}`);
  return agentModels(await response.json());
}
