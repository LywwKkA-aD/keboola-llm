/**
 * Scripted answers of the stub LLM. A reply is either { text } or { toolCalls: [{ name, args }] }.
 * The scenario is picked by a keyword in the last user message; the step by whether the caller is
 * the lead or a subagent and by the tool results that followed that message.
 */

export const MODEL_ID = 'e2e-stub-model';

export const PLAIN_REPLY = 'Команда на связи. Это потоковый ответ тестовой модели.';
export const DELEGATE_REPLY = 'Хранитель знаний проверил базу: в /knowledge лежит README.md.';
export const APPROVED_REPLY = 'Скилл e2e-skill создан.';
export const REJECTED_REPLY = 'Пользователь отклонил запись скилла, файл не создан.';

export const SKILL_PATH = '/skills/custom/e2e-skill/SKILL.md';
export const SKILL_CONTENT = `---
name: e2e-skill
description: Written by the end-to-end tests; safe to delete.
---

# E2E skill

Created by the approval scenario of the Playwright suite.
`;

const LEAD_MARKER = 'You are the lead agent';
const REJECTED = /reject/i;

/** Plain text of a chat message: strings as they are, content parts joined. */
export function textOf(message) {
  const { content } = message ?? {};
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => (typeof part === 'string' ? part : (part?.text ?? ''))).join('');
}

/** Who is asking and what happened since the last user message. */
export function readTurn(messages = []) {
  const system = messages.filter((m) => m.role === 'system' || m.role === 'developer').map(textOf).join('\n');
  const lastUser = messages.findLastIndex((m) => m.role === 'user');
  const results = messages.slice(lastUser + 1).filter((m) => m.role === 'tool').map(textOf);
  return { isLead: system.includes(LEAD_MARKER), ask: lastUser >= 0 ? textOf(messages[lastUser]) : '', results };
}

const call = (name, args) => ({ toolCalls: [{ name, args }] });
const say = (text) => ({ text });

/** Lead delegates once, then answers from the subagent's report. */
const delegateTo = (subagent, description, answer) => (results) =>
  results.length === 0 ? call('task', { subagent_type: subagent, description }) : say(answer(results.at(-1) ?? ''));

const SCENARIOS = [
  {
    keyword: 'e2e-delegate',
    lead: delegateTo('knowledge-keeper', 'e2e-delegate: list what the knowledge base holds.', () => DELEGATE_REPLY),
    subagent: (results) =>
      results.length === 0 ? call('ls', { path: '/knowledge' }) : say(`Knowledge base listing: ${results.at(-1)}`),
  },
  {
    keyword: 'e2e-approval',
    lead: delegateTo('agent-builder', 'e2e-approval: create the custom skill e2e-skill.', (report) =>
      REJECTED.test(report) ? REJECTED_REPLY : APPROVED_REPLY,
    ),
    subagent: (results) => {
      if (results.length === 0) return call('write_file', { file_path: SKILL_PATH, content: SKILL_CONTENT });
      return REJECTED.test(results.at(-1) ?? '')
        ? say('The user rejected the write; e2e-skill was not created.')
        : say(`Created ${SKILL_PATH}.`);
    },
  },
];

const PLAIN = { lead: () => say(PLAIN_REPLY), subagent: () => say('Done.') };

/** The scripted reply for one chat completion request body. */
export function planReply(body) {
  const { isLead, ask, results } = readTurn(body?.messages);
  const scenario = SCENARIOS.find(({ keyword }) => ask.includes(keyword)) ?? PLAIN;
  return isLead ? scenario.lead(results) : scenario.subagent(results);
}
