import { describe, expect, it } from 'vitest';
import { clip, splitDisabled } from './disabled-reason.ts';
import { formatBytes, formatWhen } from './version-format.ts';

describe('splitDisabled', () => {
  it('separates the role from the "Disabled:" reason', () => {
    expect(
      splitDisabled('Builds Python components: features, API clients. Disabled: needs a shell, file writes, uv, Docker and git.'),
    ).toEqual({ role: 'Builds Python components: features, API clients.', reason: 'needs a shell, file writes, uv, Docker and git.' });
  });

  it('leaves descriptions without a reason alone', () => {
    expect(splitDisabled('Answers Keboola questions.')).toEqual({ role: 'Answers Keboola questions.' });
    expect(splitDisabled('Mentions disabled: lowercase is not a marker.')).toEqual({ role: 'Mentions disabled: lowercase is not a marker.' });
    expect(splitDisabled('Disabled:   ')).toEqual({ role: 'Disabled:' });
  });
});

describe('clip', () => {
  it('shortens long text with an ellipsis', () => {
    expect(clip('short', 10)).toBe('short');
    expect(clip('a much longer reason', 10)).toBe('a much lo…');
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [900, '900 B'],
    [2150, '2.1 KB'],
    [3 * 1024 * 1024, '3.0 MB'],
  ])('%d', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('formatWhen', () => {
  it('shows the local date and time', () => {
    const text = formatWhen('2026-10-24T10:05:00Z', 'en');
    expect(text).toMatch(/2026|26/);
    expect(text).toMatch(/\d{1,2}:05/);
    expect(formatWhen('not a date', 'en')).toBe('not a date');
  });
});
