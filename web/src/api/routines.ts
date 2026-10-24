import { request } from './client.ts';

/** Scheduled routines. Keep in sync with server/src/routines/types.ts. */

export interface RoutineRun {
  readonly at: string;
  readonly threadId: string;
  /** Running or waiting for an approval. */
  readonly running: boolean;
}

export interface RoutineInfo {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly schedule: string;
  readonly timezone: string;
  readonly enabled: boolean;
  /** Only while enabled. */
  readonly nextRun?: string;
  /** Only while its chat exists. */
  readonly lastRun?: RoutineRun;
}

export interface RoutineList {
  readonly routines: readonly RoutineInfo[];
  readonly loadErrors: readonly { readonly file: string; readonly message: string }[];
}

const routine = (name: string) => `/api/routines/${encodeURIComponent(name)}`;

export const routinesApi = {
  list: () => request<RoutineList>('/api/routines'),
  setEnabled: (name: string, enabled: boolean) => request<RoutineInfo>(routine(name), 'PUT', { enabled }),
  run: (name: string) => request<{ threadId: string }>(`${routine(name)}/run`, 'POST'),
};
