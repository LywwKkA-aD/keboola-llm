import { request } from './client.ts';

/** Knowledge base and shared memory; keep in sync with server/src/knowledge/store.ts and server/src/api/routes/. */
export interface NoteSummary {
  /** Relative to the knowledge base (or projects/ for profiles), "/"-separated: "how-to/load-orders.md". */
  readonly path: string;
  readonly title: string;
  readonly size: number;
  readonly modifiedAt: string;
}

export interface Note extends NoteSummary {
  readonly content: string;
}

export interface MemoryFile {
  readonly content: string;
  /** Missing before the file exists. */
  readonly modifiedAt?: string;
}

/** Same limits as the server: notes up to 256 KB, the shared memory up to 64 KB (it goes into every prompt). */
export const MAX_NOTE_BYTES = 256 * 1024;
export const MAX_MEMORY_BYTES = 64 * 1024;

const note = (path: string) => `/api/knowledge/note?path=${encodeURIComponent(path)}`;

export const knowledgeApi = {
  notes: () => request<{ notes: NoteSummary[] }>('/api/knowledge'),
  note: (path: string) => request<Note>(note(path)),
  /** Create only: answers 409 when the path is taken. */
  createNote: (path: string, content: string) => request<NoteSummary>('/api/knowledge/note', 'POST', { path, content }),
  /** With expectedModifiedAt (the version the editor opened), a newer note on the server is a 409 instead. */
  saveNote: (path: string, content: string, expectedModifiedAt?: string) =>
    request<NoteSummary>('/api/knowledge/note', 'PUT', expectedModifiedAt ? { path, content, expectedModifiedAt } : { path, content }),
  deleteNote: (path: string) => request<void>(note(path), 'DELETE'),
  /** A .md or .txt file read as text; it lands at the top level unless a folder is given. */
  upload: (name: string, content: string, folder?: string) =>
    request<NoteSummary>('/api/knowledge/upload', 'POST', folder ? { name, content, folder } : { name, content }),
  memory: () => request<MemoryFile>('/api/memory'),
  saveMemory: (content: string, expectedModifiedAt?: string) =>
    request<MemoryFile>('/api/memory', 'PUT', expectedModifiedAt ? { content, expectedModifiedAt } : { content }),
  profiles: () => request<{ profiles: NoteSummary[] }>('/api/memory/projects'),
  profile: (file: string) => request<Note>(`/api/memory/projects/${encodeURIComponent(file)}`),
};
