/** Folders of the definitions with a version history: agents/<name>/AGENT.md and skills/<name>/SKILL.md. */
export const DEFINITION_KINDS = ['agents', 'skills'] as const;

export type DefinitionKind = (typeof DEFINITION_KINDS)[number];

/** baseline: first seen when history started; restored: written back from an older version by the user. */
export type ChangeType = 'baseline' | 'created' | 'changed' | 'deleted' | 'restored';

export interface VersionSummary {
  readonly id: number;
  readonly at: string;
  readonly change: ChangeType;
  /** Bytes of the file; 0 for a deletion. */
  readonly size: number;
  readonly restoredFrom?: number;
}

export interface Version extends VersionSummary {
  readonly hash: string;
  /** The whole file; absent for a deletion. */
  readonly content?: string;
}

/** A definition that has a history, whether it is on disk now or not. */
export interface TrackedDefinition {
  readonly name: string;
  readonly exists: boolean;
  readonly last: VersionSummary;
}

export type RestoreResult =
  | { readonly ok: true; readonly changed: boolean; readonly version?: VersionSummary }
  | { readonly ok: false; readonly reason: 'not-found' | 'deleted' };
