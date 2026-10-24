/**
 * Chat commands, typed like in Claude Code: "/" at the start of the composer. /skill, /agent and /plan go to the server
 * with the message (it tells the lead what the user chose); /init, /sql, /new and /help act in the app itself.
 */
import type { ChatCommand } from '../api/types.ts';
import type { StringKey } from '../i18n/strings.ts';

export type CommandName = 'skill' | 'agent' | 'plan' | 'init' | 'sql' | 'new' | 'help';

/** Commands the app carries out itself; the composer offers one only when its page can do it. */
export type LocalCommand = 'init' | 'sql' | 'new';

interface CommandSpec {
  readonly name: CommandName;
  readonly arg?: 'skill' | 'agent' | 'switch';
  /** Whether a request follows the command: none (acts at once), optional or required. */
  readonly text: 'none' | 'optional' | 'required';
}

const SPECS: readonly CommandSpec[] = [
  { name: 'skill', arg: 'skill', text: 'optional' },
  { name: 'agent', arg: 'agent', text: 'required' },
  { name: 'plan', text: 'required' },
  { name: 'init', text: 'none' },
  { name: 'sql', arg: 'switch', text: 'none' },
  { name: 'new', text: 'none' },
  { name: 'help', text: 'none' },
];

const LOCAL: ReadonlySet<CommandName> = new Set(['init', 'sql', 'new']);

export interface Named {
  readonly name: string;
  readonly description: string;
}

export interface CommandContext {
  /** Skills of the team. */
  readonly skills: readonly Named[];
  /** Agents a task can be given to: enabled, not the lead. */
  readonly agents: readonly Named[];
  /** The app-side commands this composer can carry out. */
  readonly local: ReadonlySet<LocalCommand>;
}

export const COMMAND_HELP: Readonly<Record<CommandName, StringKey>> = {
  skill: 'command.skill',
  agent: 'command.agent',
  plan: 'command.plan',
  init: 'command.init',
  sql: 'command.sql',
  new: 'command.new',
  help: 'command.help',
};

const ARG_HINT: Readonly<Record<NonNullable<CommandSpec['arg']>, StringKey>> = {
  skill: 'command.argSkill',
  agent: 'command.argAgent',
  switch: 'command.argSwitch',
};

const SWITCH: readonly { readonly name: 'on' | 'off'; readonly help: StringKey }[] = [
  { name: 'on', help: 'command.sqlOn' },
  { name: 'off', help: 'command.sqlOff' },
];

const offered = (context: CommandContext) => SPECS.filter((spec) => !LOCAL.has(spec.name) || context.local.has(spec.name as LocalCommand));

export interface MenuItem {
  readonly key: string;
  readonly label: string;
  /** A placeholder for the argument, e.g. "<skill>". */
  readonly argHint?: StringKey;
  /** What it does: a string key for commands, the skill's or agent's own description for arguments. */
  readonly help: { readonly key: StringKey } | { readonly text: string };
  /** The composer text once this item is picked. */
  readonly value: string;
  /** Picking it with Enter carries it out at once (nothing else to type). */
  readonly run: boolean;
}

const matches = (name: string, typed: string) => name.toLowerCase().includes(typed.toLowerCase());

/** What the menu lists for the text typed so far; empty when the menu has nothing to offer. */
export function menuItems(value: string, context: CommandContext): MenuItem[] {
  const naming = /^\/([a-z]*)$/i.exec(value);
  if (naming) {
    const typed = naming[1] ?? '';
    return offered(context)
      .filter((spec) => spec.name.startsWith(typed.toLowerCase()))
      .map((spec) => ({
        key: spec.name,
        label: `/${spec.name}`,
        ...(spec.arg ? { argHint: ARG_HINT[spec.arg] } : {}),
        help: { key: COMMAND_HELP[spec.name] },
        value: spec.arg || spec.text !== 'none' ? `/${spec.name} ` : `/${spec.name}`,
        run: !spec.arg && spec.text === 'none',
      }));
  }
  const arguing = /^\/([a-z]+) (\S*)$/.exec(value);
  const spec = arguing && offered(context).find((entry) => entry.name === arguing[1]);
  if (!arguing || !spec?.arg) return [];
  const typed = arguing[2] ?? '';
  if (spec.arg === 'switch') {
    return SWITCH.filter((option) => option.name.startsWith(typed)).map((option) => ({
      key: option.name,
      label: option.name,
      help: { key: option.help },
      value: `/${spec.name} ${option.name}`,
      run: true,
    }));
  }
  const list = spec.arg === 'skill' ? context.skills : context.agents;
  return list
    .filter((entry) => matches(entry.name, typed))
    .map((entry) => ({ key: entry.name, label: entry.name, help: { text: entry.description }, value: `/${spec.name} ${entry.name} `, run: false }));
}

export type Parsed =
  | { readonly kind: 'send'; readonly text: string; readonly command?: ChatCommand }
  | { readonly kind: 'init' | 'new' | 'help' }
  | { readonly kind: 'sql'; readonly allow: boolean }
  | { readonly kind: 'error'; readonly key: StringKey; readonly name?: string };

/**
 * What submitting the composer means. Only a command the composer offers counts: "/knowledge/notes.md" or an
 * unknown "/word" is sent as the plain text it is.
 */
export function parseInput(value: string, context: CommandContext): Parsed {
  const text = value.trim();
  const match = /^\/([a-z]+)(?:\s+([\s\S]*))?$/.exec(text);
  const spec = match && offered(context).find((entry) => entry.name === match[1]);
  if (!match || !spec) return { kind: 'send', text };
  const rest = (match[2] ?? '').trim();
  const [first = '', ...others] = rest.split(/\s+/);
  const after = rest.slice(first.length).trim();

  switch (spec.name) {
    case 'skill':
      if (!first) return { kind: 'error', key: 'command.needSkill' };
      if (!context.skills.some((skill) => skill.name === first)) return { kind: 'error', key: 'command.unknownSkill', name: first };
      return { kind: 'send', text: after, command: { name: 'skill', arg: first } };
    case 'agent':
      if (!first) return { kind: 'error', key: 'command.needAgent' };
      if (!context.agents.some((agent) => agent.name === first)) return { kind: 'error', key: 'command.unknownAgent', name: first };
      if (!after) return { kind: 'error', key: 'command.needText', name: `/agent ${first}` };
      return { kind: 'send', text: after, command: { name: 'agent', arg: first } };
    case 'plan':
      return rest ? { kind: 'send', text: rest, command: { name: 'plan' } } : { kind: 'error', key: 'command.needText', name: '/plan' };
    case 'sql':
      if (others.length === 0 && (first === 'on' || first === 'off')) return { kind: 'sql', allow: first === 'on' };
      return { kind: 'error', key: 'command.sqlUsage' };
    default:
      return { kind: spec.name };
  }
}

/** "/skill keboola-change", as the user types it. */
export const commandLabel = (command: ChatCommand): string => ('arg' in command ? `/${command.name} ${command.arg}` : `/${command.name}`);
