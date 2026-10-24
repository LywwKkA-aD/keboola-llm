import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import { toChatHistory } from './history.ts';

describe('toChatHistory', () => {
  it('keeps user messages and the lead agent text, drops tool traffic', () => {
    const messages = [
      new HumanMessage({ content: 'Where is customer_id used?', id: 'h1' }),
      new AIMessage({ content: '', name: 'lead', tool_calls: [{ id: 'c', name: 'task', args: {} }], id: 'a1' }),
      new ToolMessage({ content: 'report', tool_call_id: 'c', name: 'task', id: 't1' }),
      new AIMessage({ content: [{ type: 'text', text: 'In two transformations.' }], name: 'lead', id: 'a2' }),
    ];

    expect(toChatHistory(messages)).toEqual([
      { id: 'h1', role: 'user', text: 'Where is customer_id used?' },
      { id: 'a2', role: 'assistant', text: 'In two transformations.' },
    ]);
  });

  it('shows a command message as the user typed it, not the instruction the lead got', () => {
    const studio = { text: 'Fix the join', command: { name: 'agent', arg: 'keboola-developer' } };
    const messages = [
      new HumanMessage({ content: '[The user chose /agent keboola-developer]\nHand this request to ...', additional_kwargs: { studio }, id: 'h1' }),
      new HumanMessage({ content: 'instruction', additional_kwargs: { studio: { text: '', command: { name: 'skill', arg: 'keboola-change' } } }, id: 'h2' }),
      new HumanMessage({ content: 'Plain', additional_kwargs: { studio: { text: 3 } }, id: 'h3' }),
    ];
    expect(toChatHistory(messages)).toEqual([
      { id: 'h1', role: 'user', text: 'Fix the join', command: { name: 'agent', arg: 'keboola-developer' } },
      { id: 'h2', role: 'user', text: '', command: { name: 'skill', arg: 'keboola-change' } },
      { id: 'h3', role: 'user', text: 'Plain' },
    ]);
  });

  it('keeps text written alongside tool calls and tolerates odd input', () => {
    const messages = [new AIMessage({ content: 'Let me check.', tool_calls: [{ id: 'c', name: 'ls', args: {} }], id: 'a' })];
    expect(toChatHistory(messages)).toEqual([{ id: 'a', role: 'assistant', text: 'Let me check.' }]);
    expect(toChatHistory(undefined)).toEqual([]);
  });
});
