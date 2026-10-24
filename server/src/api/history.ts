import type { BaseMessage } from '@langchain/core/messages';
import { type ChatCommand, commandSchema } from './commands.ts';

export interface ChatEntry {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  /** The command the user sent the message with (/skill, /agent, /plan). */
  readonly command?: ChatCommand;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block): block is { type: string; text: string } => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

/** What the user typed for a message sent with a command (commands.ts); the content is the lead's instruction. */
function typedOf(message: BaseMessage): { text: string; command: ChatCommand } | undefined {
  const studio = message.additional_kwargs?.studio as { text?: unknown; command?: unknown } | undefined;
  const command = commandSchema.safeParse(studio?.command);
  return command.success && typeof studio?.text === 'string' ? { text: studio.text, command: command.data } : undefined;
}

/** The user-visible conversation of a thread: user messages and the lead agent's text replies. */
export function toChatHistory(messages: readonly BaseMessage[] | undefined): ChatEntry[] {
  return (messages ?? []).flatMap((message, index): ChatEntry[] => {
    const type = message.getType();
    if (type !== 'human' && type !== 'ai') return [];
    const id = message.id ?? `m${index}`;
    const typed = type === 'human' ? typedOf(message) : undefined;
    if (typed) return [{ id, role: 'user', text: typed.text, command: typed.command }];
    const text = textOf(message.content).trim();
    if (!text) return [];
    return [{ id, role: type === 'human' ? 'user' : 'assistant', text }];
  });
}
