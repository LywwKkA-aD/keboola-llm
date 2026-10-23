import { describe, expect, it } from 'vitest';
import { translate } from './strings.ts';

describe('translate', () => {
  it('returns the string for each language', () => {
    expect(translate('en', 'nav.team')).toBe('Team');
    expect(translate('ru', 'nav.team')).toBe('Команда');
    expect(translate('cs', 'nav.team')).toBe('Tým');
  });
});
