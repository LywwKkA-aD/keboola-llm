import { useMemo, useState } from 'react';
import type { ChatCommand } from '../api/types.ts';
import { type CommandContext, type LocalCommand, parseInput } from '../lib/commands.ts';
import { useSettings } from '../state/settings-context.tsx';
import { useTeam } from '../state/team-context.tsx';
import { type CommandMenu, useCommandMenu } from './useCommandMenu.ts';

/** What a composer sends: the text and, for /skill, /agent and /plan, the command. */
export interface Outgoing {
  readonly text: string;
  readonly command?: ChatCommand;
}

/** App-side commands a page can carry out; the composer offers only those it is given. */
export interface CommandActions {
  readonly init?: () => Promise<void>;
  readonly newChat?: () => void;
  readonly sql?: (allow: boolean) => Promise<unknown>;
}

export interface CommandNote {
  readonly text: string;
  readonly tone: 'info' | 'error';
}

/** Skills and agents of the team, and the app-side commands this composer can carry out. */
function useCommandContext(actions: CommandActions): CommandContext {
  const team = useTeam();
  const { init, newChat, sql } = actions;
  return useMemo(() => {
    const local = new Set<LocalCommand>([...(init ? ['init' as const] : []), ...(newChat ? ['new' as const] : []), ...(sql ? ['sql' as const] : [])]);
    return {
      skills: team.skills.map(({ name, description }) => ({ name, description })),
      agents: team.agents.filter((agent) => agent.enabled && agent.name !== team.lead).map(({ name, description }) => ({ name, description })),
      local,
    };
  }, [team, init, newChat, sql]);
}

/**
 * The text of a composer with its command menu: submitting sends a message (with its command) or carries out an
 * app-side command, and explains in a note what is missing instead of sending something the team cannot follow.
 * `onSend` may return a promise: the text is then cleared only once it resolves to true (the message was taken).
 */
export function useCommandField({ actions, onSend }: {
  actions: CommandActions;
  onSend: (message: Outgoing) => void | Promise<boolean>;
}): {
  value: string;
  change: (value: string) => void;
  submit: (value?: string) => Promise<void>;
  menu: CommandMenu;
  note: CommandNote | undefined;
} {
  const { t } = useSettings();
  const context = useCommandContext(actions);
  const [value, setValue] = useState('');
  const [note, setNote] = useState<CommandNote>();

  const change = (next: string) => {
    setValue(next);
    setNote(undefined);
  };

  const failed = (reason: unknown) => setNote({ tone: 'error', text: reason instanceof Error ? reason.message : t('error.generic') });

  const submit = async (input = value) => {
    const parsed = parseInput(input, context);
    switch (parsed.kind) {
      case 'send': {
        if (!parsed.text && !parsed.command) return;
        setNote(undefined);
        const sent = onSend(parsed.command ? { text: parsed.text, command: parsed.command } : { text: parsed.text });
        if (!(sent instanceof Promise) || (await sent)) setValue('');
        return;
      }
      case 'help':
        // The menu lists every command with what it does.
        change('/');
        return;
      case 'new':
        change('');
        actions.newChat?.();
        return;
      case 'sql':
        change('');
        try {
          await actions.sql?.(parsed.allow);
          setNote({ tone: 'info', text: t(parsed.allow ? 'command.sqlAllowed' : 'command.sqlForbidden') });
        } catch (reason) {
          failed(reason);
        }
        return;
      case 'init':
        change('');
        await actions.init?.().catch(failed);
        return;
      case 'error':
        setNote({ tone: 'error', text: t(parsed.key).replace('{name}', parsed.name ?? '') });
    }
  };

  const menu = useCommandMenu({ value, context, onChange: change, onRun: (next) => void submit(next) });
  return { value, change, submit, menu, note };
}
