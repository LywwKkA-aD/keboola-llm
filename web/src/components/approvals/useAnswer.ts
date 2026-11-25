import { useState } from 'react';
import { api } from '../../api/client.ts';
import type { Decision, PendingApprovalEntry } from '../../api/types.ts';
import { friendlyError } from '../../lib/errors.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';

/**
 * Approve or reject every request of one pending interrupt, then refresh the shared list. Each approval is answered on
 * its own: the server resumes the run once a chat has none left.
 */
export function useAnswer() {
  const { refreshApprovals } = useLive();
  const { t } = useSettings();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const answer = async (entry: PendingApprovalEntry, decision: Decision) => {
    setBusy(entry.interruptId);
    setError(undefined);
    try {
      await api.answer(entry.threadId, [{ interruptId: entry.interruptId, decisions: entry.requests.map(() => decision) }]);
    } catch (reason) {
      setError(friendlyError(reason, t));
    } finally {
      setBusy(undefined);
      refreshApprovals();
    }
  };

  return { answer, busy, error };
}
