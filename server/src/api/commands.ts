/**
 * Chat commands: the user says up front what they want (/skill, /agent, /plan) instead of hoping the lead reads it
 * from the text. The server turns a command into a plain instruction for the lead and keeps what the user typed next
 * to it (additional_kwargs.studio, never sent to the model), so the chat history shows the command, not the prompt.
 */
import { z } from 'zod';
import type { TeamInfo } from './types.ts';

const name = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);

export const commandSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('skill'), arg: name }).strict(),
  z.object({ name: z.literal('agent'), arg: name }).strict(),
  z.object({ name: z.literal('plan') }).strict(),
]);

export type ChatCommand = z.infer<typeof commandSchema>;

/** What the history keeps of a message sent with a command. */
export interface Typed {
  readonly text: string;
  readonly command: ChatCommand;
}

export const commandLabel = (command: ChatCommand): string => ('arg' in command ? `/${command.name} ${command.arg}` : `/${command.name}`);

/** Why the server refuses a message, in words the user can act on; undefined when it is fine. */
export function commandError(text: string, command: ChatCommand | undefined, team: TeamInfo): string | undefined {
  if (!command || command.name !== 'skill') {
    if (!text) return command ? `Say what to do after ${commandLabel(command)}` : 'Say what to do';
  }
  if (command?.name === 'skill' && !team.skills.some((skill) => skill.name === command.arg)) return `No skill "${command.arg}" in this team`;
  if (command?.name === 'agent') {
    if (command.arg === team.lead) return 'The lead already reads every message; name another agent';
    const agent = team.agents.find((entry) => entry.name === command.arg);
    if (!agent) return `No agent "${command.arg}" in this team`;
    if (!agent.enabled) return `Agent "${command.arg}" is turned off; turn it on in Agents first`;
  }
  return undefined;
}

const NO_REQUEST = 'Nothing beyond the command: apply it as the skill describes.';

function instruction(text: string, command: ChatCommand, team: TeamInfo): string {
  const head = `[The user chose ${commandLabel(command)}]`;
  const request = `Request: ${text || NO_REQUEST}`;
  switch (command.name) {
    case 'skill': {
      const path = team.skills.find((skill) => skill.name === command.arg)?.path ?? '';
      return [
        head,
        `Work on this request with the skill "${command.arg}": read ${path}SKILL.md first and follow it, or delegate to the subagent that has this skill and tell it to follow it.`,
        request,
      ].join('\n');
    }
    case 'agent':
      return [
        head,
        `Hand this request to the subagent "${command.arg}" with the task tool and report its result. Do not do it yourself and do not give it to another agent; if "${command.arg}" cannot do it, say why.`,
        request,
      ].join('\n');
    case 'plan':
      return [
        head,
        'Before changing anything, look at what is needed, make a short plan and ask the user to approve it with request_plan_approval. Carry out only the approved plan.',
        request,
      ].join('\n');
  }
}

export interface UserTurn {
  readonly messages: readonly { readonly role: 'user'; readonly content: string; readonly additional_kwargs?: { readonly studio: Typed } }[];
}

/** The input of a run for one user message: the text as is, or the command's instruction with what was typed. */
export function userTurn(text: string, command: ChatCommand | undefined, team: TeamInfo): UserTurn {
  if (!command) return { messages: [{ role: 'user', content: text }] };
  return { messages: [{ role: 'user', content: instruction(text, command, team), additional_kwargs: { studio: { text, command } } }] };
}
