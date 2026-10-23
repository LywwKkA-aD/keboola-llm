import { ChatOpenAI } from '@langchain/openai';
import type { OmniRouteConfig } from '../config/env.ts';
import { withoutNoopChunks } from './sse-filter.ts';

/** Chat model factory for the OpenAI-compatible OmniRoute endpoint; one client per model id. */
export function createModelFactory(config: OmniRouteConfig): (modelId?: string) => ChatOpenAI {
  if (!config.apiKey) throw new Error('OMNIROUTE_API_KEY is not set (see .env.example)');
  const cache = new Map<string, ChatOpenAI>();

  return (modelId = config.model) => {
    if (!modelId) throw new Error('OMNIROUTE_MODEL is not set (see .env.example)');
    const cached = cache.get(modelId);
    if (cached) return cached;
    const model = new ChatOpenAI({
      model: modelId,
      apiKey: config.apiKey,
      configuration: { baseURL: config.baseUrl, fetch: withoutNoopChunks() },
      streaming: true,
      maxRetries: 2,
    });
    cache.set(modelId, model);
    return model;
  };
}
