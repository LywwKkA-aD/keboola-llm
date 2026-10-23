import type { Language } from '../api/types.ts';
import { cs } from './cs.ts';
import { en, type StringKey } from './en.ts';
import { ru } from './ru.ts';

export type { StringKey } from './en.ts';

const TABLES: Record<Language, Record<StringKey, string>> = { en, ru, cs };

export const LANGUAGE_NAMES: Record<Language, string> = { ru: 'Русский', en: 'English', cs: 'Čeština' };

export function translate(language: Language, key: StringKey): string {
  return TABLES[language][key];
}
