import type { LoadError } from '../registry/types.ts';

/** The latest run of a routine; only reported while its chat still exists. */
export interface RoutineRun {
  readonly at: string;
  readonly threadId: string;
  /** Running or waiting for an approval: the routine will not start again until it ends. */
  readonly running: boolean;
}

/** A routine as the UI sees it (GET /api/routines): no prompt, no absolute paths. */
export interface RoutineInfo {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly schedule: string;
  /** The zone the schedule is read in: the routine's own or the machine's. */
  readonly timezone: string;
  /** The user's switch when set, otherwise the routine file's default. */
  readonly enabled: boolean;
  /** Only while enabled. */
  readonly nextRun?: string;
  readonly lastRun?: RoutineRun;
}

export interface RoutineList {
  readonly routines: readonly RoutineInfo[];
  readonly loadErrors: readonly LoadError[];
}

export interface RoutinesApi {
  list(): RoutineList;
  /** Undefined when there is no such routine. */
  setEnabled(name: string, enabled: boolean): RoutineInfo | undefined;
  /** Start a run now. Undefined when there is no such routine; throws RUN_CONFLICT while its last run still goes. */
  runNow(name: string): { readonly threadId: string } | undefined;
}
