import { ApiError } from '../api/client.ts';
import type { StringKey } from '../i18n/strings.ts';

/** Conflicts the server reports in English, by what they mean for the user. */
const CONFLICTS: readonly [RegExp, StringKey][] = [
  [/waiting for an approval/i, 'error.waitingApproval'],
  [/busy with another run/i, 'error.busyRun'],
  [/not waiting for an answer|no pending approvals/i, 'error.approvalGone'],
  [/nothing to continue/i, 'error.nothingToContinue'],
];

/** A message for the user: known server conflicts in their language, anything else as it came. */
export function friendlyError(reason: unknown, t: (key: StringKey) => string): string {
  if (reason instanceof ApiError && reason.status === 409) {
    const known = CONFLICTS.find(([pattern]) => pattern.test(reason.message));
    if (known) return t(known[1]);
  }
  return reason instanceof Error ? reason.message : t('error.generic');
}

/** Whether the server says the user's view of a chat is out of date (refetch it). */
export const isConflict = (reason: unknown) => reason instanceof ApiError && reason.status === 409;
