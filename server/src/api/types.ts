import type { Settings } from '../config/settings.ts';
import type { KeboolaProject } from '../system/keboola.ts';
import type { OnboardingStatus } from '../system/onboarding.ts';
import type { SystemStatus } from '../system/status.ts';
import type { LoadError } from '../registry/types.ts';
import type { DefinitionVersions } from '../versions/tracker.ts';
import type { RoutinesApi } from '../routines/types.ts';
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
  /** Model ids from OmniRoute (asked with the server key). */
  readonly models: () => Promise<readonly string[]>;
  /** Projects registered in kbagent, without tokens. */
  readonly keboolaProjects: () => Promise<readonly KeboolaProject[]>;
  /** The shared memory file the lead agent keeps. */
  readonly memory: () => Promise<string>;
  readonly system: () => Promise<SystemStatus>;
  /** Model and Keboola project in use after settings overrides. */
  readonly effective: () => { readonly model: string; readonly keboolaProject: string };
  /** Whether project-scout has profiled the project in use (drives the first-run card on Home). */
  readonly onboarding: () => Promise<OnboardingStatus>;
  readonly version: string;
  /** Version history and rollback of agents and custom skills; without it the routes are not registered. */
  readonly versions?: DefinitionVersions;
  /** Scheduled routines (routines/*.md); without it the /api/routines routes are not registered. */
  readonly routines?: RoutinesApi;
}
