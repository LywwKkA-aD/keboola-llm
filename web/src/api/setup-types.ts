/** First-run setup contract. Keep in sync with server/src/setup/checks.ts and server/src/setup/service.ts. */
import type { KeboolaProject } from './types.ts';

export type SetupStepId = 'omniroute' | 'apiKey' | 'model' | 'kbagent' | 'projects' | 'project' | 'access';
export type SetupStatus = 'ok' | 'fail' | 'blocked';
export type SetupReason =
  | 'unreachable'
  | 'http'
  | 'keyMissing'
  | 'keyRejected'
  | 'modelMissing'
  | 'modelFailed'
  | 'kbagentMissing'
  | 'projectsNone'
  | 'projectsFailed'
  | 'projectMissing'
  | 'projectUnknown'
  | 'sessionExpired'
  | 'accessUnreadable';

export interface SetupStep {
  readonly id: SetupStepId;
  readonly status: SetupStatus;
  readonly reason?: SetupReason;
  /** Short English facts from the server, e.g. "kbagent v0.100.2" or "HTTP 401". */
  readonly detail: string;
}

/** The OmniRoute key is write-only: the UI only learns whether one is set. */
export interface OmniRouteState {
  readonly baseUrl: string;
  readonly apiKeySet: boolean;
}

export interface SetupReport {
  readonly steps: readonly SetupStep[];
  readonly complete: boolean;
  readonly models: readonly string[];
  readonly projects: readonly KeboolaProject[];
  readonly omniroute: OmniRouteState;
  /** The model and Keboola project in use (settings override .env); empty when not chosen. */
  readonly effective: { readonly model: string; readonly keboolaProject: string };
}

export interface ModelTest {
  readonly ok: boolean;
  readonly model: string;
  readonly latencyMs: number;
  readonly error?: string;
}

export interface OmniRouteInput {
  readonly apiKey: string;
  readonly baseUrl?: string;
}
