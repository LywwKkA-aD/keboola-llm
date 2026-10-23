import { describe, expect, it } from 'vitest';
import { parseChatStream } from './sse.mjs';

const frame = (delta, finishReason = null) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;

describe('parseChatStream', () => {
  it('concatenates text content deltas', () => {
    const text = frame({ content: 'Hel' }) + frame({ content: 'lo' }) + frame({}, 'stop') + 'data: [DONE]\n\n';
    expect(parseChatStream(text)).toEqual({ content: 'Hello', toolCalls: [], finishReason: 'stop' });
  });

  it('assembles tool call arguments split across chunks', () => {
    const text =
      frame({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'add', arguments: '' } }] }) +
      frame({ tool_calls: [{ index: 0, function: { arguments: '{"a":17,' } }] }) +
      frame({ tool_calls: [{ index: 0, function: { arguments: '"b":25}' } }] }) +
      frame({}, 'tool_calls') +
      'data: [DONE]\n\n';

    expect(parseChatStream(text)).toEqual({
      content: '',
      toolCalls: [{ id: 'call_1', name: 'add', arguments: '{"a":17,"b":25}' }],
      finishReason: 'tool_calls',
    });
  });

  it('keeps parallel tool calls ordered by index', () => {
    const text =
      frame({ tool_calls: [{ index: 1, id: 'b', function: { name: 'second', arguments: '{}' } }] }) +
      frame({ tool_calls: [{ index: 0, id: 'a', function: { name: 'first', arguments: '{}' } }] });

    expect(parseChatStream(text).toolCalls.map((call) => call.name)).toEqual(['first', 'second']);
  });

  it('does not duplicate a tool name repeated in every chunk', () => {
    const text =
      frame({ tool_calls: [{ index: 0, id: 'c', function: { name: 'add', arguments: '{"a":1,' } }] }) +
      frame({ tool_calls: [{ index: 0, function: { name: 'add', arguments: '"b":2}' } }] });

    expect(parseChatStream(text).toolCalls).toEqual([{ id: 'c', name: 'add', arguments: '{"a":1,"b":2}' }]);
  });

  it('ignores comments, blank lines, CRLF and malformed frames', () => {
    const text = ': keep-alive\r\n\r\ndata: {not json}\r\n\r\n' + frame({ content: 'ok' }).replace(/\n/g, '\r\n');
    expect(parseChatStream(text).content).toBe('ok');
  });

  it('returns an empty result for an empty stream', () => {
    expect(parseChatStream('')).toEqual({ content: '', toolCalls: [], finishReason: null });
  });
});
