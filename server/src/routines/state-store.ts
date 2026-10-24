import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
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

function read(file: string): ReadonlyMap<string, RoutineState> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return new Map();
    return new Map(
      Object.entries(parsed).flatMap(([name, value]) => {
        const state = stateSchema.safeParse(value);
        return state.success ? [[name, state.data] as const] : [];
      }),
    );
  } catch {
    return new Map();
  }
}

export function createRoutineStateStore(file: string): RoutineStateStore {
  let states = read(file);

  const save = (next: ReadonlyMap<string, RoutineState>) => {
    states = next;
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(Object.fromEntries(states), null, 2)}\n`);
    renameSync(temp, file);
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
