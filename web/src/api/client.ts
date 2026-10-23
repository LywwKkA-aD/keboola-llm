import type { ChatEntry, InterruptAnswer, Settings, TeamInfo, Thread, ThreadPolicy } from './types.ts';
import type { PendingApproval } from '../state/run-state.ts';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
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
  createThread: (text: string) => request<{ thread: Thread; runId: string }>('/api/threads', 'POST', { text }),
  send: (id: string, text: string) => request<{ runId: string }>(`${thread(id)}/messages`, 'POST', { text }),
  history: (id: string) => request<ChatEntry[]>(`${thread(id)}/messages`),
  approvals: (id: string) => request<PendingApproval[]>(`${thread(id)}/approvals`),
  answer: (id: string, answers: readonly InterruptAnswer[]) => request<{ runId: string }>(`${thread(id)}/approvals`, 'POST', { answers }),
  cancel: (id: string) => request<{ cancelled: boolean }>(`${thread(id)}/cancel`, 'POST'),
  policy: (id: string) => request<ThreadPolicy>(`${thread(id)}/policy`),
  setPolicy: (id: string, policy: ThreadPolicy) => request<ThreadPolicy>(`${thread(id)}/policy`, 'PUT', policy),
  rename: (id: string, title: string) => request<Thread>(thread(id), 'PATCH', { title }),
  remove: (id: string) => request<void>(thread(id), 'DELETE'),
};

export const eventsUrl = (threadId?: string) =>
  threadId ? `/api/events?threadId=${encodeURIComponent(threadId)}` : '/api/events';
