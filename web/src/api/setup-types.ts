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

/** How a verified change reaches production (server/src/system/keboola-access.ts). */
export type ChangePath = 'promote' | 'merge-request' | 'keboola-ui' | 'read-only';

/** What a step found, as data for the UI to word in the user's language. `none`: the reason says it all. */
export type SetupFacts =
  // config: where kbagent in the app reads its projects (only when it has none or fails to list them).
  | { readonly kind: 'none'; readonly config?: string }
  | { readonly kind: 'router'; readonly url: string; readonly models?: number; readonly provider?: string }
  | { readonly kind: 'unreachable'; readonly url: string; readonly error?: string }
  | { readonly kind: 'http'; readonly url: string; readonly status: number }
  | { readonly kind: 'keyAccepted' }
  | { readonly kind: 'keyRejected'; readonly status: number }
  | { readonly kind: 'modelAnswered'; readonly model: string; readonly ms: number }
  | { readonly kind: 'modelFailed'; readonly model: string; readonly error: string }
  | { readonly kind: 'version'; readonly version: string }
  | { readonly kind: 'error'; readonly message: string; readonly config?: string }
  | { readonly kind: 'projects'; readonly aliases: readonly string[] }
  | { readonly kind: 'project'; readonly alias: string; readonly source: 'configured' | 'default' | 'only' }
  | { readonly kind: 'projectUnknown'; readonly alias: string }
  | {
      readonly kind: 'access';
      readonly role?: string;
      readonly token?: true;
      readonly backend?: string;
      readonly changePath: ChangePath;
      readonly protectedProduction: boolean;
    }
  | { readonly kind: 'session'; readonly session: string };

export interface SetupStep {
  readonly id: SetupStepId;
  readonly status: SetupStatus;
  readonly reason?: SetupReason;
  /** Short English facts for the terminal, e.g. "kbagent v0.100.2"; the UI words `facts` instead. */
  readonly detail: string;
  /** Absent on blocked steps. */
  readonly facts?: SetupFacts;
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
