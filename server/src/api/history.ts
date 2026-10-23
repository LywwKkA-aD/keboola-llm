import type { BaseMessage } from '@langchain/core/messages';

export interface ChatEntry {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block): block is { type: string; text: string } => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

/** The user-visible conversation of a thread: user messages and the lead agent's text replies. */
export function toChatHistory(messages: readonly BaseMessage[] | undefined): ChatEntry[] {
  return (messages ?? []).flatMap((message, index): ChatEntry[] => {
    const type = message.getType();
    if (type !== 'human' && type !== 'ai') return [];
    const text = textOf(message.content).trim();
    if (!text) return [];
    return [{ id: message.id ?? `m${index}`, role: type === 'human' ? 'user' : 'assistant', text }];
  });
}
