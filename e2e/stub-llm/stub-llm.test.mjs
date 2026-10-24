import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { completion, splitText, streamChunks } from './chunks.mjs';
import { APPROVED_REPLY, DELEGATE_REPLY, MODEL_ID, PLAIN_REPLY, planReply, readTurn, REJECTED_REPLY, SKILL_PATH } from './scenarios.mjs';
import { startStubLlm } from './server.mjs';

const lead = { role: 'system', content: 'You are the lead agent of a small team of AI agents.' };
const specialist = { role: 'system', content: [{ type: 'text', text: 'You are a specialist agent on a team.' }] };
const user = (content) => ({ role: 'user', content });
const tool = (content) => ({ role: 'tool', content, tool_call_id: 'call_1' });
const meta = { id: 'chatcmpl-1', model: MODEL_ID, created: 1 };

describe('readTurn', () => {
  it('tells the lead from a subagent and keeps only tool results after the last user message', () => {
    const turn = readTurn([lead, user('first'), tool('old'), user('second'), tool('new')]);
    expect(turn).toEqual({ isLead: true, ask: 'second', results: ['new'] });
    expect(readTurn([specialist, user([{ type: 'text', text: 'task' }])]).isLead).toBe(false);
  });
});

describe('planReply', () => {
  it('answers a plain question with text', () => {
    expect(planReply({ messages: [lead, user('Привет')] })).toEqual({ text: PLAIN_REPLY });
  });

  it('delegates to the knowledge keeper, which lists /knowledge, then the lead reports', () => {
    const first = planReply({ messages: [lead, user('e2e-delegate: что в базе знаний?')] });
    expect(first.toolCalls?.[0]).toMatchObject({ name: 'task', args: { subagent_type: 'knowledge-keeper' } });
    const brief = first.toolCalls?.[0]?.args.description;
    expect(planReply({ messages: [specialist, user(brief)] }).toolCalls?.[0]).toEqual({ name: 'ls', args: { path: '/knowledge' } });
    expect(planReply({ messages: [specialist, user(brief), tool('["/knowledge/README.md"]')] }).text).toContain('README.md');
    expect(planReply({ messages: [lead, user('e2e-delegate: что в базе знаний?'), tool('listing')] })).toEqual({ text: DELEGATE_REPLY });
  });

  it('has the agent builder write the skill and reports approval or rejection', () => {
    const first = planReply({ messages: [lead, user('e2e-approval: создай скилл')] });
    expect(first.toolCalls?.[0]).toMatchObject({ name: 'task', args: { subagent_type: 'agent-builder' } });
    const brief = first.toolCalls?.[0]?.args.description;
    expect(planReply({ messages: [specialist, user(brief)] }).toolCalls?.[0]).toMatchObject({ name: 'write_file', args: { file_path: SKILL_PATH } });
    expect(planReply({ messages: [specialist, user(brief), tool('The user rejected this action.')] }).text).toMatch(/rejected/);
    expect(planReply({ messages: [lead, user('e2e-approval'), tool('The user rejected the write')] })).toEqual({ text: REJECTED_REPLY });
    expect(planReply({ messages: [lead, user('e2e-approval'), tool(`Created ${SKILL_PATH}.`)] })).toEqual({ text: APPROVED_REPLY });
  });
});

describe('chunks', () => {
  it('streams the role first, then content, the finish reason and usage', () => {
    const chunks = streamChunks({ text: 'a'.repeat(30) }, meta);
    expect(chunks[0]?.choices[0]?.delta).toEqual({ role: 'assistant', content: '' });
    expect(chunks.slice(1, -2).map((c) => c.choices[0]?.delta.content).join('')).toBe('a'.repeat(30));
    expect(chunks.at(-2)?.choices[0]?.finish_reason).toBe('stop');
    expect(chunks.at(-1)).toMatchObject({ choices: [], usage: { total_tokens: 144 } });
  });

  it('streams tool calls as an id and name followed by argument pieces', () => {
    const chunks = streamChunks({ toolCalls: [{ name: 'ls', args: { path: '/knowledge' } }] }, meta);
    const calls = chunks.slice(1, -2).map((c) => c.choices[0]?.delta.tool_calls?.[0]);
    expect(calls[0]).toMatchObject({ index: 0, type: 'function', function: { name: 'ls', arguments: '' } });
    expect(JSON.parse(calls.slice(1).map((c) => c?.function.arguments).join(''))).toEqual({ path: '/knowledge' });
    expect(chunks.at(-2)?.choices[0]?.finish_reason).toBe('tool_calls');
  });

  it('builds the non-streaming form and splits text evenly', () => {
    expect(completion({ text: 'hi' }, meta).choices[0]).toMatchObject({ message: { content: 'hi' }, finish_reason: 'stop' });
    expect(completion({ toolCalls: [{ name: 'ls', args: {} }] }, meta).choices[0]?.message.tool_calls?.[0]?.function).toEqual({ name: 'ls', arguments: '{}' });
    expect(splitText('abcde', 2)).toEqual(['ab', 'cd', 'e']);
  });
});

describe('startStubLlm', () => {
  let stub;
  const auth = { authorization: 'Bearer test' };
  beforeAll(async () => {
    stub = await startStubLlm({ chunkDelayMs: 0 });
  });
  afterAll(() => stub.close());

  it('lists the model and rejects calls without a key', async () => {
    expect(await (await fetch(`${stub.url}/models`, { headers: auth })).json()).toMatchObject({ data: [{ id: MODEL_ID }] });
    expect((await fetch(`${stub.url}/models`)).status).toBe(401);
  });

  it('streams server-sent events ending with [DONE]', async () => {
    const response = await fetch(`${stub.url}/chat/completions`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL_ID, stream: true, messages: [lead, user('hi')] }),
    });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const events = (await response.text()).split('\n\n').filter(Boolean);
    expect(events.at(-1)).toBe('data: [DONE]');
    const text = events
      .slice(0, -1)
      .map((event) => JSON.parse(event.slice('data: '.length)))
      .map((chunk) => chunk.choices[0]?.delta.content ?? '')
      .join('');
    expect(text).toBe(PLAIN_REPLY);
  });
});
