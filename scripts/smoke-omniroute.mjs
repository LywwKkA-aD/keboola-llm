#!/usr/bin/env node
/**
 * Verify that the configured OmniRoute model can do what agents need:
 * tool calling, a tool-result round trip, and streamed tool calls.
 *
 *   npm run smoke:omniroute [-- <model-id>]
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnv } from './lib/dotenv.mjs';
import { readOmniRouteConfig } from './lib/omniroute-config.mjs';
import { parseChatStream } from './lib/sse.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 120_000;

const ADD_TOOL = {
  type: 'function',
  function: {
    name: 'add',
    description: 'Add two numbers and return the sum.',
    parameters: {
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
      required: ['a', 'b'],
    },
  },
};

const BASE_MESSAGES = [
  { role: 'system', content: 'You are a calculator. Always use the add tool for arithmetic, never compute in your head.' },
  { role: 'user', content: 'What is 17 + 25?' },
];

async function post(config, body) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, ...body }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response;
}

function expectAddCall(call) {
  if (call?.name !== 'add') throw new Error(`expected a call to "add", got ${JSON.stringify(call ?? null)}`);
  const args = JSON.parse(call.arguments || '{}');
  if (Number(args.a) + Number(args.b) !== 42) throw new Error(`unexpected arguments ${call.arguments}`);
  return call;
}

async function toolCall(config) {
  const message = (await (await post(config, { messages: BASE_MESSAGES, tools: [ADD_TOOL] })).json()).choices?.[0]
    ?.message;
  const raw = message?.tool_calls?.[0];
  expectAddCall(raw && { name: raw.function?.name, arguments: raw.function?.arguments });
  return message;
}

async function roundTrip(config, assistantMessage) {
  const call = assistantMessage.tool_calls[0];
  const messages = [...BASE_MESSAGES, assistantMessage, { role: 'tool', tool_call_id: call.id, content: '42' }];
  const answer = (await (await post(config, { messages, tools: [ADD_TOOL] })).json()).choices?.[0]?.message?.content;
  if (!String(answer ?? '').includes('42')) throw new Error(`final answer does not mention 42: ${answer}`);
}

async function streamedToolCall(config) {
  const response = await post(config, { messages: BASE_MESSAGES, tools: [ADD_TOOL], stream: true });
  expectAddCall(parseChatStream(await response.text()).toolCalls[0]);
}

async function step(name, fn) {
  const started = Date.now();
  try {
    const value = await fn();
    console.log(`[ok] ${name} (${Date.now() - started} ms)`);
    return { passed: true, value };
  } catch (error) {
    console.log(`[fail] ${name}: ${error.message}`);
    return { passed: false };
  }
}

async function main() {
  loadDotEnv(join(ROOT, '.env'));
  const base = readOmniRouteConfig(process.env);
  const config = { ...base, model: process.argv[2] ?? base.model };
  if (!config.apiKey || !config.model) {
    console.log('[fail] set OMNIROUTE_API_KEY and OMNIROUTE_MODEL in .env (or pass the model as an argument)');
    process.exitCode = 1;
    return;
  }

  console.log(`Model: ${config.model} via ${config.baseUrl}`);
  const first = await step('tool call', () => toolCall(config));
  const results = [
    first,
    first.passed ? await step('tool result round trip', () => roundTrip(config, first.value)) : { passed: false },
    await step('streamed tool call', () => streamedToolCall(config)),
  ];
  process.exitCode = results.every((result) => result.passed) ? 0 : 1;
}

main();
