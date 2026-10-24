import { describe, expect, it } from 'vitest';
import { normalizeUsage, normalizeUsageEvent } from './usage-normalize.ts';

// What OmniRoute sent for a Claude model: the first call wrote the cache, the second read it.
const writeCall = {
  prompt_tokens: 10,
  completion_tokens: 4,
  total_tokens: 14,
  cache_creation_input_tokens: 6335,
  prompt_tokens_details: { cache_creation_in_prompt: false },
};
const readCall = {
  prompt_tokens: 6345,
  completion_tokens: 4,
  total_tokens: 6349,
  prompt_tokens_details: { cached_tokens: 6335 },
  cache_read_input_tokens: 6335,
};

describe('normalizeUsage', () => {
  it('counts a cache write OmniRoute left out of prompt_tokens and reports it as cache_write_tokens', () => {
    expect(normalizeUsage(writeCall)).toMatchObject({
      prompt_tokens: 6345,
      total_tokens: 6349,
      prompt_tokens_details: { cache_write_tokens: 6335, cache_creation_in_prompt: true },
    });
  });

  it('leaves usage without a cache write as it is', () => {
    expect(normalizeUsage(readCall)).toBe(readCall);
  });

  it('only reports the write when the proxy does not say it is missing from prompt_tokens', () => {
    const included = { prompt_tokens: 6345, total_tokens: 6349, cache_creation_input_tokens: 6335 };
    expect(normalizeUsage(included)).toMatchObject({ prompt_tokens: 6345, total_tokens: 6349, prompt_tokens_details: { cache_write_tokens: 6335 } });
  });

  it('keeps a cache write the provider already reports the OpenAI way', () => {
    const reported = { ...writeCall, prompt_tokens_details: { cache_write_tokens: 6335 } };
    expect(normalizeUsage(reported)).toBe(reported);
  });
});

describe('normalizeUsageEvent', () => {
  const event = (body: object) => `data: ${JSON.stringify(body)}`;

  it('rewrites the usage of an SSE chunk', () => {
    const out = normalizeUsageEvent(event({ id: 'c1', choices: [], usage: writeCall }));
    expect(JSON.parse(out.slice(5))).toMatchObject({ id: 'c1', usage: { prompt_tokens: 6345 } });
  });

  it.each([
    ['a content chunk', event({ choices: [{ delta: { content: 'hi' } }] })],
    ['a usage chunk without a cache write', event({ choices: [], usage: readCall })],
    ['the done marker', 'data: [DONE]'],
    ['broken JSON that mentions the field', 'data: {"cache_creation_input_tokens": '],
  ])('leaves %s untouched', (_name, input) => {
    expect(normalizeUsageEvent(input)).toBe(input);
  });
});
