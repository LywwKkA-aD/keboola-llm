export const LANGUAGES = { ru: 'Russian', en: 'English', cs: 'Czech' } as const;

export type LanguageCode = keyof typeof LANGUAGES;

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  typeof value === 'string' && Object.hasOwn(LANGUAGES, value);

/** Instruction that pins the user-facing reply language. Internal work stays in English. */
export function languageInstruction(code: LanguageCode): string {
  const language = LANGUAGES[code];
  return [
    '## Reply language',
    `Always write your replies to the user in ${language}, whatever language the user writes in.`,
    'Keep these verbatim, untranslated: code, SQL, identifiers, table/column/bucket names, CLI commands, file paths and error messages.',
    `Anything you write for other agents or into files stays in English unless the user explicitly asks for ${language}.`,
  ].join('\n');
}
