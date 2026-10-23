import { useState } from 'react';
import { api } from '../../api/client.ts';
import type { Decision, PendingApprovalEntry } from '../../api/types.ts';
import { useLive } from '../../live/live-context.tsx';

/** Approve or reject every request of one pending interrupt, then refresh the shared list. */
export function useAnswer() {
  const { refreshApprovals } = useLive();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const answer = async (entry: PendingApprovalEntry, decision: Decision) => {
    setBusy(entry.interruptId);
    setError(undefined);
    try {
      await api.answer(entry.threadId, [{ interruptId: entry.interruptId, decisions: entry.requests.map(() => decision) }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(undefined);
      refreshApprovals();
    }
  };

  return { answer, busy, error };
}
