import { type FileIo, defaultIo, readJsonFile, writeJsonAtomic } from '../storage/json-file.ts';
import { z } from 'zod';

const stateSchema = z.object({
  /** The user's switch in Settings; overrides `enabled` from the routine file. */
  enabled: z.boolean().optional(),
  /** Every scheduled time up to here is settled: it ran, was skipped, or was not owed because the routine was off. */
  settledUntil: z.iso.datetime().optional(),
  lastRun: z.object({ at: z.iso.datetime(), threadId: z.string().min(1) }).optional(),
});

/** What this installation remembers about one routine (DATA_DIR/routines.json, never the repo file). */
export type RoutineState = Readonly<z.infer<typeof stateSchema>>;

export interface RoutineStateStore {
  get(name: string): RoutineState;
  /** Apply a change and write the whole file atomically if anything changed. */
  update(name: string, change: (state: RoutineState) => RoutineState): RoutineState;
}

const read = (file: string, io: FileIo): ReadonlyMap<string, RoutineState> =>
  readJsonFile<ReadonlyMap<string, RoutineState>>(file, {
    fallback: new Map(),
    io,
    parse: (parsed) =>
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? new Map(
            Object.entries(parsed).flatMap(([name, value]) => {
              const state = stateSchema.safeParse(value);
              return state.success ? [[name, state.data] as const] : [];
            }),
          )
        : undefined,
  });

export function createRoutineStateStore(file: string, io: FileIo = defaultIo): RoutineStateStore {
  let states = read(file, io);

  // Memory follows the file: when the write fails, the change throws and is not taken.
  const save = (next: ReadonlyMap<string, RoutineState>) => {
    writeJsonAtomic(file, Object.fromEntries(next), { io });
    states = next;
  };

  return {
    get: (name) => states.get(name) ?? {},
    update(name, change) {
      const current = states.get(name) ?? {};
      const next = change(current);
      if (JSON.stringify(next) !== JSON.stringify(current)) save(new Map(states).set(name, next));
      return next;
    },
  };
}
