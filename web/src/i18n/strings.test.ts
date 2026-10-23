import { describe, expect, it } from 'vitest';
import { cs } from './cs.ts';
import { en } from './en.ts';
import { ru } from './ru.ts';
import { translate } from './strings.ts';

describe('translate', () => {
  it('returns the string for each language', () => {
    expect(translate('en', 'nav.agents')).toBe('Agents');
    expect(translate('ru', 'nav.agents')).toBe('Агенты');
    expect(translate('cs', 'nav.agents')).toBe('Agenti');
  });

  it('has every key translated and nothing left empty', () => {
    const keys = Object.keys(en).toSorted();
    [ru, cs].forEach((table) => {
      expect(Object.keys(table).toSorted()).toEqual(keys);
      expect(Object.values(table).every((text) => text.trim().length > 0)).toBe(true);
    });
  });
});
