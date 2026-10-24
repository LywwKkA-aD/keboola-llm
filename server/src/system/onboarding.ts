import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { KeboolaProject } from './keboola.ts';

/** Whether the team has profiled the Keboola project it works on (project-scout writes the profile). */
export interface OnboardingStatus {
  readonly project: string;
  readonly profiled: boolean;
  readonly updatedAt?: string;
}

/** Profile file of a project inside /memories/projects/; project-scout uses the same rule. */
export const profileFileName = (alias: string) => `${alias.replace(/[^A-Za-z0-9_-]/g, '-')}.md`;

/** kbagent's own choice without --project: its default project, else the only one registered. */
async function defaultProject(projects: () => Promise<readonly KeboolaProject[]>): Promise<string> {
  try {
    const listed = await projects();
    return (listed.find((project) => project.isDefault) ?? (listed.length === 1 ? listed[0] : undefined))?.alias ?? '';
  } catch {
    return '';
  }
}

export async function onboardingStatus({ memoriesDir, project, projects }: {
  memoriesDir: string;
  /** The configured project; empty means kbagent's default one. */
  project: string;
  projects: () => Promise<readonly KeboolaProject[]>;
}): Promise<OnboardingStatus> {
  const alias = project || (await defaultProject(projects));
  if (!alias) return { project: '', profiled: false };
  try {
    const { mtime } = await stat(join(memoriesDir, 'projects', profileFileName(alias)));
    return { project: alias, profiled: true, updatedAt: mtime.toISOString() };
  } catch {
    return { project: alias, profiled: false };
  }
}
