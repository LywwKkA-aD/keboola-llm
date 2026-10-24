/**
 * OmniRoute reports a Claude cache write Anthropic's way (cache_creation_input_tokens next to the OpenAI usage) and,
 * as it says with prompt_tokens_details.cache_creation_in_prompt: false, leaves those tokens out of prompt_tokens.
 * LangChain reads only the OpenAI fields, so the first call of a conversation would count a handful of input tokens
 * and no cache write. Rewrite such usage the OpenAI way before LangChain sees it.
 */

type Usage = Readonly<Record<string, unknown>>;

const isRec = (value: unknown): value is Usage => typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** Pure: the usage with a cache write in prompt_tokens and in prompt_tokens_details.cache_write_tokens. */
export function normalizeUsage(usage: Usage): Usage {
  const written = num(usage.cache_creation_input_tokens);
  const details = isRec(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {};
  if (written <= 0 || details.cache_write_tokens != null) return usage;
  const missing = details.cache_creation_in_prompt === false;
  return {
    ...usage,
    ...(missing ? { prompt_tokens: num(usage.prompt_tokens) + written, total_tokens: num(usage.total_tokens) + written } : {}),
    prompt_tokens_details: { ...details, cache_write_tokens: written, ...(missing ? { cache_creation_in_prompt: true } : {}) },
  };
}

/** One SSE event with its usage normalized; anything else comes back unchanged. */
export function normalizeUsageEvent(event: string): string {
  if (!event.includes('cache_creation_input_tokens')) return event;
  const lines = event.split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith('data:'));
  if (index < 0) return event;
  try {
    const parsed: unknown = JSON.parse(lines[index]?.slice(5) ?? '');
    if (!isRec(parsed) || !isRec(parsed.usage)) return event;
    const usage = normalizeUsage(parsed.usage);
    if (usage === parsed.usage) return event;
    return lines.with(index, `data: ${JSON.stringify({ ...parsed, usage })}`).join('\n');
  } catch {
    return event;
  }
}
