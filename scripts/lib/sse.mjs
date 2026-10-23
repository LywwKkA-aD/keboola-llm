/**
 * Parse a complete OpenAI-compatible chat completion SSE stream into
 * the final text, assembled tool calls and finish reason.
 */
export function parseChatStream(text) {
  const deltas = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((payload) => payload && payload !== '[DONE]')
    .map(safeJson)
    .filter(Boolean)
    .map((chunk) => chunk.choices?.[0])
    .filter(Boolean);

  const initial = { content: '', calls: new Map(), finishReason: null };
  const result = deltas.reduce(applyChoice, initial);

  return {
    content: result.content,
    toolCalls: [...result.calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call),
    finishReason: result.finishReason,
  };
}

function applyChoice(state, choice) {
  const delta = choice.delta ?? {};
  return {
    content: state.content + (delta.content ?? ''),
    calls: (delta.tool_calls ?? []).reduce(mergeToolCall, state.calls),
    finishReason: choice.finish_reason ?? state.finishReason,
  };
}

function mergeToolCall(calls, part) {
  const index = part.index ?? 0;
  const previous = calls.get(index) ?? { id: '', name: '', arguments: '' };
  const next = {
    id: part.id ?? previous.id,
    // Some proxies repeat the name in every chunk, so keep the first one instead of concatenating.
    name: previous.name || (part.function?.name ?? ''),
    arguments: previous.arguments + (part.function?.arguments ?? ''),
  };
  return new Map(calls).set(index, next);
}

function safeJson(payload) {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}
