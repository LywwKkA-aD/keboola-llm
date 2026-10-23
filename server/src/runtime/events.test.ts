import { AIMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import { createEventMapper, initialMapperState, mapChunk } from './events.ts';

const SUB_NS = ['tools:abc'];
const meta = (agent: string) => ({ lc_agent_name: agent });

const leadCallsTask = [
  [],
  'updates',
  {
    model_request: {
      messages: [
        new AIMessage({
          content: '',
          name: 'lead',
          tool_calls: [{ id: 'call-task', name: 'task', args: { subagent_type: 'knowledge-keeper', description: 'List notes' } }],
          usage_metadata: { input_tokens: 100, output_tokens: 10, total_tokens: 110, input_token_details: { cache_read: 90 } },
        }),
      ],
    },
  },
] as const;

const subCallsGlob = [
  SUB_NS,
  'updates',
  { model_request: { messages: [new AIMessage({ content: '', name: 'knowledge-keeper', tool_calls: [{ id: 'call-glob', name: 'glob', args: { pattern: '**/*' } }] })] } },
] as const;

const globResult = [SUB_NS, 'updates', { tools: { messages: [new ToolMessage({ content: '/knowledge/README.md', name: 'glob', tool_call_id: 'call-glob' })] } }] as const;

const taskResult = [[], 'updates', { tools: { messages: [new ToolMessage({ content: 'Only a README.', name: 'task', tool_call_id: 'call-task' })] } }] as const;

describe('mapChunk', () => {
  it('turns a task tool call into a delegation and reports usage', () => {
    const [, events] = mapChunk(initialMapperState('lead'), leadCallsTask);
    expect(events).toEqual([
      { type: 'usage', agent: 'lead', input: 100, output: 10, cached: 90 },
      { type: 'delegate.start', agent: 'lead', callId: 'call-task', to: 'knowledge-keeper', task: 'List notes' },
    ]);
  });

  it('attributes tool results to the agent that made the call', () => {
    const [state] = mapChunk(initialMapperState('lead'), subCallsGlob);
    const [, events] = mapChunk(state, globResult);
    expect(events).toEqual([
      { type: 'tool.end', agent: 'knowledge-keeper', callId: 'call-glob', tool: 'glob', ok: true, preview: '/knowledge/README.md' },
    ]);
  });

  it('closes a delegation when the task result arrives', () => {
    const [state] = mapChunk(initialMapperState('lead'), leadCallsTask);
    const [, events] = mapChunk(state, taskResult);
    expect(events).toEqual([{ type: 'delegate.end', agent: 'lead', callId: 'call-task', to: 'knowledge-keeper', ok: true }]);
  });

  it('emits tool.start for ordinary tools', () => {
    const [, events] = mapChunk(initialMapperState('lead'), subCallsGlob);
    expect(events).toEqual([
      { type: 'tool.start', agent: 'knowledge-keeper', callId: 'call-glob', tool: 'glob', args: { pattern: '**/*' } },
    ]);
  });

  it('emits a final message for a step without tool calls', () => {
    const chunk = [[], 'updates', { model_request: { messages: [new AIMessage({ content: 'Done.', name: 'lead' })] } }] as const;
    expect(mapChunk(initialMapperState('lead'), chunk)[1]).toEqual([{ type: 'message', agent: 'lead', text: 'Done.' }]);
  });

  it('marks failed tool results', () => {
    const [state] = mapChunk(initialMapperState('lead'), subCallsGlob);
    const failed = [SUB_NS, 'updates', { tools: { messages: [new ToolMessage({ content: 'boom', name: 'glob', tool_call_id: 'call-glob', status: 'error' })] } }] as const;
    expect(mapChunk(state, failed)[1][0]).toMatchObject({ type: 'tool.end', ok: false, preview: 'boom' });
  });

  it('truncates long tool output previews', () => {
    const [state] = mapChunk(initialMapperState('lead'), subCallsGlob);
    const long = [SUB_NS, 'updates', { tools: { messages: [new ToolMessage({ content: 'x'.repeat(5000), name: 'glob', tool_call_id: 'call-glob' })] } }] as const;
    const event = mapChunk(state, long)[1][0] as { preview: string };
    expect(event.preview.length).toBeLessThanOrEqual(401);
  });

  it('streams text tokens with the agent name', () => {
    const chunk = [['model_request:1'], 'messages', [new AIMessageChunk({ content: 'Hel' }), meta('lead')]] as const;
    expect(mapChunk(initialMapperState('lead'), chunk)[1]).toEqual([{ type: 'token', agent: 'lead', text: 'Hel' }]);
  });

  it('does not stream tool results as tokens', () => {
    const toolChunk = [['tools:1'], 'messages', [new ToolMessage({ content: 'Successfully replaced', tool_call_id: 'c', name: 'edit_file' }), meta('lead')]] as const;
    expect(mapChunk(initialMapperState('lead'), toolChunk)[1]).toEqual([]);
  });

  it('extracts text from content blocks and skips empty tokens', () => {
    const blocks = [['m'], 'messages', [new AIMessageChunk({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }), meta('x')]] as const;
    const empty = [['m'], 'messages', [new AIMessageChunk({ content: '' }), meta('x')]] as const;
    expect(mapChunk(initialMapperState('lead'), blocks)[1]).toEqual([{ type: 'token', agent: 'x', text: 'ab' }]);
    expect(mapChunk(initialMapperState('lead'), empty)[1]).toEqual([]);
  });

  const interruptChunk = (namespace: readonly string[], id = 'int-1') =>
    [
      namespace,
      'updates',
      {
        __interrupt__: [
          {
            id,
            value: {
              actionRequests: [{ name: 'write_file', args: { file_path: '/agents/x/AGENT.md' }, description: 'Review' }],
              reviewConfigs: [{ actionName: 'write_file', allowedDecisions: ['approve', 'reject'] }],
            },
          },
        ],
      },
    ] as const;

  it('surfaces approval requests with their interrupt id', () => {
    expect(mapChunk(initialMapperState('lead'), interruptChunk(SUB_NS))[1]).toEqual([
      {
        type: 'approval.required',
        interruptId: 'int-1',
        requests: [{ tool: 'write_file', args: { file_path: '/agents/x/AGENT.md' }, description: 'Review', decisions: ['approve', 'reject'] }],
      },
    ]);
  });

  it('reports an interrupt once even when parent and subgraph both emit it', () => {
    const [state, first] = mapChunk(initialMapperState('lead'), interruptChunk(SUB_NS));
    const [, second] = mapChunk(state, interruptChunk([]));
    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
  });

  it('keeps distinct interrupts apart', () => {
    const [state] = mapChunk(initialMapperState('lead'), interruptChunk(SUB_NS, 'a'));
    expect(mapChunk(state, interruptChunk(['tools:other'], 'b'))[1]).toHaveLength(1);
  });

  it('ignores middleware updates and unknown shapes', () => {
    expect(mapChunk(initialMapperState('lead'), [[], 'updates', { 'MemoryMiddleware.before_agent': {} }])[1]).toEqual([]);
    expect(mapChunk(initialMapperState('lead'), [[], 'custom', {}])[1]).toEqual([]);
    expect(mapChunk(initialMapperState('lead'), 'garbage' as never)[1]).toEqual([]);
  });

  it('does not mutate the previous state', () => {
    const start = initialMapperState('lead');
    mapChunk(start, leadCallsTask);
    expect(start.calls.size).toBe(0);
  });
});

describe('createEventMapper', () => {
  it('keeps state across chunks', () => {
    const map = createEventMapper('lead');
    map(subCallsGlob);
    expect(map(globResult)[0]).toMatchObject({ agent: 'knowledge-keeper' });
  });
});
