import type { RunManager } from '../api/runs.ts';
import type { ThreadStore } from '../api/threads.ts';
import type { RoutineDefinition } from '../registry/routines.ts';
import { stampOf } from './zone.ts';

/** The first message of a routine's chat: which routine and when (the lead has no clock), then its own text. */
export function routineMessage(routine: RoutineDefinition, at: number, timeZone: string): string {
  const { date, time, weekday } = stampOf(at, timeZone);
  return `Scheduled routine "${routine.title}" (${routine.name}), started ${weekday} ${date} ${time} ${timeZone}.\n\n${routine.prompt}`;
}

/**
 * Start one run of a routine the way POST /api/threads starts a chat: a new chat, titled
 * "<title> · <date>", whose first message goes to the lead. Returns the chat id.
 */
export function createRoutineLauncher({ threads, runs }: {
  threads: Pick<ThreadStore, 'create' | 'rename' | 'remove'>;
  runs: Pick<RunManager, 'start'>;
}): (routine: RoutineDefinition, at: number, timeZone: string) => string {
  return (routine, at, timeZone) => {
    const text = routineMessage(routine, at, timeZone);
    const thread = threads.create(text);
    threads.rename(thread.id, `${routine.title} · ${stampOf(at, timeZone).date}`);
    try {
      runs.start(thread.id, { messages: [{ role: 'user', content: text }] });
    } catch (error) {
      threads.remove(thread.id);
      throw error;
    }
    return thread.id;
  };
}
