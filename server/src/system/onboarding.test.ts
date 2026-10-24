import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTree } from '../test-utils/tree.ts';
import { onboardingStatus, profileFileName } from './onboarding.ts';

const projects = (...aliases: string[]) => async () =>
  aliases.map((alias, index) => ({ alias, name: alias, id: index, stackUrl: 'https://x', isDefault: index === 0 }));

describe('profileFileName', () => {
  it('keeps kbagent aliases readable and makes anything else a safe file name', () => {
    expect(profileFileName('t4ch-admin-gmail-com')).toBe('t4ch-admin-gmail-com.md');
    expect(profileFileName('prod.eu_1')).toBe('prod-eu_1.md');
    expect(profileFileName('../evil/x y')).toBe('---evil-x-y.md');
  });
});

describe('onboardingStatus', () => {
  it('reports a project the team has not profiled yet', async () => {
    const memoriesDir = makeTree({ 'AGENTS.md': '# Shared memory' });
    expect(await onboardingStatus({ memoriesDir, project: 'sandbox', projects: projects('other') })).toEqual({ project: 'sandbox', profiled: false });
  });

  it('reports when the profile was written', async () => {
    const memoriesDir = makeTree({ 'projects/sandbox.md': '# Project sandbox' });
    utimesSync(join(memoriesDir, 'projects', 'sandbox.md'), new Date('2026-10-24T10:00:00Z'), new Date('2026-10-24T10:00:00Z'));
    expect(await onboardingStatus({ memoriesDir, project: 'sandbox', projects: projects() })).toEqual({
      project: 'sandbox',
      profiled: true,
      updatedAt: '2026-10-24T10:00:00.000Z',
    });
  });

  it('falls back to the default kbagent project when none is configured', async () => {
    const memoriesDir = makeTree({});
    mkdirSync(join(memoriesDir, 'projects'));
    writeFileSync(join(memoriesDir, 'projects', 'main.md'), '# Project main');
    expect(await onboardingStatus({ memoriesDir, project: '', projects: projects('main', 'other') })).toMatchObject({ project: 'main', profiled: true });
  });

  it('uses the only registered project when kbagent has no default, as kbagent itself does', async () => {
    const memoriesDir = makeTree({});
    const solo = async () => [{ alias: 'solo', name: 'Solo', id: 1, stackUrl: 'https://x', isDefault: false }];
    expect(await onboardingStatus({ memoriesDir, project: '', projects: solo })).toEqual({ project: 'solo', profiled: false });
  });

  it('has no project to offer without kbagent or registered projects', async () => {
    const memoriesDir = makeTree({});
    const failing = async () => {
      throw new Error('kbagent: command not found');
    };
    expect(await onboardingStatus({ memoriesDir, project: '', projects: failing })).toEqual({ project: '', profiled: false });
    expect(await onboardingStatus({ memoriesDir, project: '', projects: projects() })).toEqual({ project: '', profiled: false });
  });
});
