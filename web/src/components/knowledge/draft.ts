/** What the Knowledge page is editing; one draft at a time, kept by the page so leaving it can be guarded. */
export type Draft =
  | { readonly kind: 'note'; readonly path: string; readonly original: string; readonly text: string; readonly baseModifiedAt?: string }
  | { readonly kind: 'new'; readonly path: string; readonly text: string }
  | { readonly kind: 'memory'; readonly original: string; readonly text: string; readonly baseModifiedAt?: string };

/** Unsaved work worth a warning: changed text, or anything typed into a new note. */
export const isDirty = (draft: Draft | undefined): boolean => {
  if (!draft) return false;
  return draft.kind === 'new' ? draft.text.trim() !== '' : draft.text !== draft.original;
};
