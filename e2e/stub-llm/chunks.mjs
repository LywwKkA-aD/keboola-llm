/** OpenAI chat completion payloads for a scripted reply: streaming chunks and the plain JSON form. */

const USAGE = { prompt_tokens: 120, completion_tokens: 24, total_tokens: 144 };

/** Small pieces, so the client really receives a stream of deltas. */
export function splitText(text, size = 12) {
  const pieces = [];
  for (let i = 0; i < text.length; i += size) pieces.push(text.slice(i, i + size));
  return pieces;
}

const toolCallsOf = (reply, idOf) =>
  (reply.toolCalls ?? []).map((toolCall, index) => ({
    index,
    id: idOf(index),
    name: toolCall.name,
    args: JSON.stringify(toolCall.args ?? {}),
  }));

/**
 * Chunks in the order OpenAI sends them: the role first, then content or tool call deltas,
 * the finish reason and finally the usage (stream_options.include_usage).
 */
export function streamChunks(reply, { id, model, created }) {
  const chunk = (choices, extra = {}) => ({ id, object: 'chat.completion.chunk', created, model, choices, ...extra });
  const delta = (value, finishReason = null) => chunk([{ index: 0, delta: value, finish_reason: finishReason }]);
  const calls = toolCallsOf(reply, (index) => `call_${id}_${index}`);

  const body = calls.length
    ? calls.flatMap((toolCall) => [
        delta({ tool_calls: [{ index: toolCall.index, id: toolCall.id, type: 'function', function: { name: toolCall.name, arguments: '' } }] }),
        ...splitText(toolCall.args, 40).map((part) => delta({ tool_calls: [{ index: toolCall.index, function: { arguments: part } }] })),
      ])
    : splitText(reply.text ?? '').map((content) => delta({ content }));

  return [
    delta({ role: 'assistant', content: '' }),
    ...body,
    delta({}, calls.length ? 'tool_calls' : 'stop'),
    chunk([], { usage: USAGE }),
  ];
}

/** What an OpenAI-compatible router sends when the upstream model gives up in the middle of an answer. */
export const STREAM_ERROR = { error: { message: 'e2e: upstream overloaded', type: 'server_error', code: 'overloaded' } };

/** A stream that starts like streamChunks, then breaks off after the first piece with STREAM_ERROR. */
export function brokenChunks(reply, meta) {
  return [...streamChunks(reply, meta).slice(0, 2), STREAM_ERROR];
}

/** The non-streaming chat.completion object for the same reply. */
export function completion(reply, { id, model, created }) {
  const calls = toolCallsOf(reply, (index) => `call_${id}_${index}`);
  const message = calls.length
    ? { role: 'assistant', content: null, tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args } })) }
    : { role: 'assistant', content: reply.text ?? '' };
  return {
    id,
    object: 'chat.completion',
    created,
    model,
    choices: [{ index: 0, message, finish_reason: calls.length ? 'tool_calls' : 'stop' }],
    usage: USAGE,
  };
}
