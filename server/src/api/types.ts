import type { Settings } from '../config/settings.ts';
import type { LoadError } from '../registry/types.ts';
import type { EventBus } from './bus.ts';
import type { Allowed } from './guard.ts';
import type { ChatEntry } from './history.ts';
import type { RunManager } from './runs.ts';
import type { ThreadStore } from './threads.ts';

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
  readonly loadErrors: readonly LoadError[];
}

export interface ServerDeps {
  readonly bus: EventBus;
  readonly runs: RunManager;
  readonly threads: ThreadStore;
  readonly team: () => TeamInfo;
  readonly settings: { get(): Settings; set(patch: Partial<Settings>): Settings };
  readonly history: (threadId: string) => Promise<readonly ChatEntry[]>;
  readonly deleteThread: (threadId: string) => Promise<void>;
  readonly allowed: Allowed;
  readonly staticDir?: string;
}
