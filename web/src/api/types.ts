/**
 * API contract with the server. Keep in sync with server/src/runtime/events.ts,
 * server/src/api/bus.ts, server/src/api/threads.ts, server/src/api/history.ts and server/src/api/types.ts.
 */

export type Language = 'ru' | 'en' | 'cs';

export type Theme = 'dark' | 'light' | 'system';
export type Quality = 'high' | 'medium' | 'low';
export type ReduceMotion = 'on' | 'off' | 'system';

export interface Settings {
  readonly language: Language;
  readonly theme: Theme;
  readonly quality: Quality;
  readonly reduceMotion: ReduceMotion;
  /** Empty: the model from the server .env. */
  readonly model: string;
  /** Empty: the Keboola project from the server .env. */
  readonly keboolaProject: string;
  readonly allowSqlByDefault: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'ru',
  theme: 'dark',
  quality: 'high',
  reduceMotion: 'system',
  model: '',
  keboolaProject: '',
  allowSqlByDefault: false,
};

export interface Thread {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ChatEntry {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

export interface ApprovalRequest {
  readonly tool: string;
  readonly agent?: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly description?: string;
  readonly decisions: readonly string[];
}

export type TeamEvent =
  | { readonly type: 'token'; readonly agent: string; readonly text: string }
  | { readonly type: 'message'; readonly agent: string; readonly text: string }
  | { readonly type: 'tool.start'; readonly agent: string; readonly callId: string; readonly tool: string; readonly args: Readonly<Record<string, unknown>> }
  | { readonly type: 'tool.end'; readonly agent: string; readonly callId: string; readonly tool: string; readonly ok: boolean; readonly preview: string }
  | { readonly type: 'delegate.start'; readonly agent: string; readonly callId: string; readonly to: string; readonly task: string }
  | { readonly type: 'delegate.end'; readonly agent: string; readonly callId: string; readonly to: string; readonly ok: boolean }
  | { readonly type: 'approval.required'; readonly interruptId: string; readonly requests: readonly ApprovalRequest[] }
  | { readonly type: 'usage'; readonly agent: string; readonly input: number; readonly output: number; readonly cached: number };

export type RunEvent =
  | { readonly type: 'run.started'; readonly runId: string }
  | { readonly type: 'run.waiting'; readonly runId: string }
  | { readonly type: 'run.finished'; readonly runId: string }
  | { readonly type: 'run.failed'; readonly runId: string; readonly error: string }
  | { readonly type: 'approval.auto'; readonly interruptId: string; readonly requests: readonly ApprovalRequest[] };
/** App-wide news, published on SYSTEM_THREAD. */
export type SystemEvent = { readonly type: 'team.updated' };

export interface ThreadPolicy {
  readonly allowSql: boolean;
}

export type BusEvent = TeamEvent | RunEvent | SystemEvent;

/** Thread id for events that belong to no chat. */
export const SYSTEM_THREAD = '_system';

export interface Envelope {
  readonly seq: number;
  readonly threadId: string;
  readonly event: BusEvent;
}

export interface AgentInfo {
  readonly name: string;
  readonly description: string;
  readonly role: 'orchestrator' | 'subagent';
  readonly enabled: boolean;
  readonly skills: readonly string[];
  readonly tools: readonly string[];
  readonly access?: 'read' | 'write';
  readonly avatar?: { readonly color?: string; readonly prop?: string };
  readonly basedOn?: string;
}

export interface TeamInfo {
  readonly lead: string;
  readonly agents: readonly AgentInfo[];
  readonly skills: readonly { readonly name: string; readonly description: string; readonly source: string }[];
  readonly warnings: readonly string[];
  readonly loadErrors: readonly { readonly file: string; readonly message: string }[];
}

export type Decision = { readonly type: 'approve' } | { readonly type: 'reject'; readonly message?: string };

export interface InterruptAnswer {
  readonly interruptId: string;
  readonly decisions: readonly Decision[];
}

/** A paused run waiting for the user, across all chats (GET /api/approvals). */
export interface PendingApprovalEntry {
  readonly threadId: string;
  readonly threadTitle: string;
  readonly interruptId: string;
  readonly requests: readonly ApprovalRequest[];
}

export interface AppStatus {
  readonly model: string;
  readonly keboolaProject: string;
  readonly version: string;
  readonly activeRuns: number;
  readonly pendingApprovals: number;
}

export interface KeboolaProject {
  readonly alias: string;
  readonly name: string;
  readonly id: number | null;
  readonly stackUrl: string;
  readonly isDefault: boolean;
}

export interface Check {
  readonly ok: boolean;
  readonly detail: string;
}

export interface SystemStatus {
  readonly app: Check;
  readonly node: Check;
  readonly omniroute: Check;
  readonly model: Check;
  readonly kbagent: Check;
}
