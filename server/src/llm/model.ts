import { ChatOpenAI } from '@langchain/openai';
import type { OmniRouteConfig } from '../config/env.ts';
import { withoutNoopChunks } from './sse-filter.ts';

const SETUP_HINT = 'finish the setup on the Home page or in Settings';

/**
 * Stands in for OmniRoute while the app is not set up: every call fails at once with a message that says
 * what is missing, instead of the client's generic "missing credentials" or a request for model "".
 */
const notSetUp =
  (problem: string): typeof fetch =>
  async () =>
    new Response(JSON.stringify({ error: { message: `${problem}: ${SETUP_HINT}`, type: 'setup_required' } }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });

/**
 * Chat model factory for the OpenAI-compatible OmniRoute endpoint; one client per model id. Without a key
 * or a model id the app still starts (the setup wizard asks for them); only calling such a model fails.
 */
export function createModelFactory(config: OmniRouteConfig): (modelId?: string) => ChatOpenAI {
  const cache = new Map<string, ChatOpenAI>();

  return (modelId = config.model) => {
    const cached = cache.get(modelId);
    if (cached) return cached;
    const problem = !config.apiKey ? 'OMNIROUTE_API_KEY is not set' : !modelId ? 'No model is chosen' : undefined;
    const model = new ChatOpenAI({
      model: modelId,
      // The client refuses to start without a key; the stand-in fetch answers before any key is used.
      apiKey: config.apiKey || 'not-set',
      configuration: { baseURL: config.baseUrl, fetch: problem ? notSetUp(problem) : withoutNoopChunks() },
      streaming: true,
      maxRetries: 2,
    });
    cache.set(modelId, model);
    return model;
  };
}
