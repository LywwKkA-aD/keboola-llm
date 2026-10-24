import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { loadRoutines } from './routines.ts';

const routineMd = (frontmatter: string, body = 'Check the failed jobs and report.') => `---\n${frontmatter.trim()}\n---\n\n${body}\n`;

const MORNING = routineMd(`
name: morning-check
description: Weekday health check of the project.
schedule: "0 8 * * 1-5"
`);

describe('loadRoutines', () => {
  it('loads routines/<name>.md with defaults: off, title from the name, the machine zone', () => {
    const root = makeTree({
      'routines/morning-check.md': MORNING,
      'routines/weekly.md': routineMd(`
name: weekly
title: Weekly refresh
description: Refresh the project profile.
schedule: "0  7 * * MON"
timezone: Europe/Prague
enabled: true
`),
    });
    const { items, errors } = loadRoutines(root);

    expect(errors).toEqual([]);
    expect(items.map((routine) => routine.name)).toEqual(['morning-check', 'weekly']);
    expect(items[0]).toMatchObject({
      name: 'morning-check',
      title: 'Morning check',
      description: 'Weekday health check of the project.',
      schedule: '0 8 * * 1-5',
      enabled: false,
      prompt: 'Check the failed jobs and report.',
      file: 'routines/morning-check.md',
    });
    expect(items[0]?.timezone).toBeUndefined();
    expect(items[0]?.cron.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(items[1]).toMatchObject({ title: 'Weekly refresh', schedule: '0 7 * * MON', timezone: 'Europe/Prague', enabled: true });
  });

  it('ships the morning check, the weekly profile refresh and the memory tidy-up, all switched off', () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const { items, errors } = loadRoutines(repoRoot);

    expect(errors).toEqual([]);
    expect(items.map(({ name, schedule, enabled }) => ({ name, schedule, enabled }))).toEqual([
      { name: 'memory-tidy', schedule: '0 17 * * 5', enabled: false },
      { name: 'morning-check', schedule: '0 8 * * 1-5', enabled: false },
      { name: 'profile-refresh', schedule: '0 7 * * 1', enabled: false },
    ]);
    expect(items[2]?.prompt).toContain('project-scout');
    expect(items[0]?.prompt).toContain('/memories/AGENTS.md');
  });

  it('has no routines and no errors without a routines folder', () => {
    expect(loadRoutines(makeTree({}))).toEqual({ items: [], errors: [] });
  });

  it('ignores files that are not Markdown and folders', () => {
    const root = makeTree({ 'routines/morning-check.md': MORNING, 'routines/notes.txt': 'x', 'routines/drafts/x.md': 'x' });
    expect(loadRoutines(root).items.map((routine) => routine.name)).toEqual(['morning-check']);
  });

  it('reports broken files with the reason and keeps the good ones', () => {
    const root = makeTree({
      'routines/morning-check.md': MORNING,
      'routines/bad-cron.md': routineMd('name: bad-cron\ndescription: Has a bad schedule.\nschedule: "0 25 * * *"'),
      'routines/bad-zone.md': routineMd('name: bad-zone\ndescription: Has a bad zone.\nschedule: "0 8 * * *"\ntimezone: Mars/Base'),
      'routines/other-name.md': routineMd('name: renamed\ndescription: Name does not match.\nschedule: "0 8 * * *"'),
      'routines/empty.md': routineMd('name: empty\ndescription: Has no message.\nschedule: "0 8 * * *"', ''),
      'routines/extra.md': routineMd('name: extra\ndescription: Unknown key.\nschedule: "0 8 * * *"\nagent: lead'),
      'routines/yaml.md': '---\nname: [unclosed\n---\nBody',
    });
    const { items, errors } = loadRoutines(root);

    expect(items.map((routine) => routine.name)).toEqual(['morning-check']);
    const byFile = Object.fromEntries(errors.map((error) => [error.file, error.message]));
    expect(Object.keys(byFile).toSorted()).toEqual([
      'routines/bad-cron.md',
      'routines/bad-zone.md',
      'routines/empty.md',
      'routines/extra.md',
      'routines/other-name.md',
      'routines/yaml.md',
    ]);
    expect(byFile['routines/bad-cron.md']).toMatch(/hour.*0-23/);
    expect(byFile['routines/bad-zone.md']).toMatch(/time zone/);
    expect(byFile['routines/other-name.md']).toMatch(/must match its file name "other-name"/);
    expect(byFile['routines/empty.md']).toMatch(/message/);
    expect(byFile['routines/extra.md']).toMatch(/agent/);
  });
});
