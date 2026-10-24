export type NoteErrorCode = 'NOTE_INVALID' | 'NOTE_NOT_FOUND' | 'NOTE_EXISTS' | 'NOTE_TOO_LARGE';

const STATUS: Record<NoteErrorCode, number> = { NOTE_INVALID: 400, NOTE_NOT_FOUND: 404, NOTE_EXISTS: 409, NOTE_TOO_LARGE: 413 };

export type NoteError = Error & { readonly code: NoteErrorCode; readonly statusCode: number };

/** An error the API answers with its status and message; messages never carry absolute paths. */
export function noteError(code: NoteErrorCode, message: string): NoteError {
  return Object.assign(new Error(message), { code, statusCode: STATUS[code] });
}

export const isNoteError = (error: unknown, code?: NoteErrorCode): error is NoteError =>
  error instanceof Error && typeof (error as Partial<NoteError>).statusCode === 'number' && (code === undefined || (error as NoteError).code === code);
