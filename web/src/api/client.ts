import type {
  AppStatus,
  ChatCommand,
  ChatEntry,
  Envelope,
  InterruptAnswer,
  KeboolaProject,
  OnboardingStatus,
  PendingApprovalEntry,
  Settings,
  SystemStatus,
  TeamInfo,
  Thread,
  ThreadPolicy,
  UsageReport,
} from './types.ts';
import type { DefinitionKind, TrackedDefinition, VersionDetail, VersionSummary } from './types.ts';
import type { PendingApproval } from '../state/run-state.ts';
import type { ModelTest, OmniRouteInput, OmniRouteState, SetupReport } from './setup-types.ts';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  // Only send a JSON content type with a body: Fastify rejects empty JSON bodies.
  const init: RequestInit =
    body === undefined ? { method } : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const response = await fetch(path, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, payload.error ?? response.statusText);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

const thread = (id: string) => `/api/threads/${encodeURIComponent(id)}`;

export const api = {
  team: () => request<TeamInfo>('/api/team'),
  settings: () => request<Settings>('/api/settings'),
  saveSettings: (patch: Partial<Settings>) => request<Settings>('/api/settings', 'PUT', patch),
  threads: () => request<Thread[]>('/api/threads'),
  createThread: (text: string, command?: ChatCommand) => request<{ thread: Thread; runId: string }>('/api/threads', 'POST', { text, command }),
  send: (id: string, text: string, command?: ChatCommand) => request<{ runId: string }>(`${thread(id)}/messages`, 'POST', { text, command }),
  history: (id: string) => request<ChatEntry[]>(`${thread(id)}/messages`),
  approvals: (id: string) => request<PendingApproval[]>(`${thread(id)}/approvals`),
  answer: (id: string, answers: readonly InterruptAnswer[]) => request<{ runId: string }>(`${thread(id)}/approvals`, 'POST', { answers }),
  cancel: (id: string) => request<{ cancelled: boolean }>(`${thread(id)}/cancel`, 'POST'),
  resume: (id: string) => request<{ runId: string }>(`${thread(id)}/resume`, 'POST'),
  policy: (id: string) => request<ThreadPolicy>(`${thread(id)}/policy`),
  setPolicy: (id: string, policy: ThreadPolicy) => request<ThreadPolicy>(`${thread(id)}/policy`, 'PUT', policy),
  rename: (id: string, title: string) => request<Thread>(thread(id), 'PATCH', { title }),
  remove: (id: string) => request<void>(thread(id), 'DELETE'),
  allApprovals: () => request<PendingApprovalEntry[]>('/api/approvals'),
  status: () => request<AppStatus>('/api/status'),
  models: () => request<{ models: string[]; current: string }>('/api/models'),
  keboolaProjects: () => request<{ projects: KeboolaProject[]; current: string }>('/api/keboola/projects'),
  onboarding: () => request<OnboardingStatus>('/api/onboarding'),
  startOnboarding: (text: string) => request<{ threadId: string }>('/api/onboarding/start', 'POST', { text }),
  memory: () => request<{ content: string }>('/api/memory'),
  system: () => request<SystemStatus>('/api/system'),
  usage: () => request<UsageReport>('/api/usage'),
  activity: () => request<Envelope[]>('/api/activity'),
};

export const eventsUrl = (threadId?: string) =>
  threadId ? `/api/events?threadId=${encodeURIComponent(threadId)}` : '/api/events';

const versionsPath = (kind: DefinitionKind, name: string) => `/api/definitions/${kind}/${encodeURIComponent(name)}/versions`;

/** Version history and rollback of agents and custom skills. */
export const versionsApi = {
  tracked: (kind: DefinitionKind) => request<TrackedDefinition[]>(`/api/definitions/${kind}`),
  list: (kind: DefinitionKind, name: string) => request<VersionSummary[]>(versionsPath(kind, name)),
  get: (kind: DefinitionKind, name: string, id: number) => request<VersionDetail>(`${versionsPath(kind, name)}/${id}`),
  restore: (kind: DefinitionKind, name: string, id: number) =>
    request<{ changed: boolean; version?: VersionSummary }>(`${versionsPath(kind, name)}/${id}/restore`, 'POST'),
};

/** First-run setup wizard. The OmniRoute key only ever travels in a POST body, never in a URL. */
export const setupApi = {
  report: (retest = false) => request<SetupReport>(retest ? '/api/setup?retest=1' : '/api/setup'),
  testModel: () => request<ModelTest>('/api/setup/test-model', 'POST'),
  saveOmniRoute: (input: OmniRouteInput) => request<OmniRouteState>('/api/setup/omniroute', 'POST', input),
};
