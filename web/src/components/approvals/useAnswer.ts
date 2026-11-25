import { useEffect, useState } from 'react';
import { api } from '../../api/client.ts';
import type { Decision, PendingApprovalEntry } from '../../api/types.ts';
import { friendlyError } from '../../lib/errors.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';

const without = (set: ReadonlySet<string>, id: string) => new Set([...set].filter((entry) => entry !== id));

/**
 * Approve or reject every request of one pending interrupt, then refresh the shared list. Each approval is answered on
 * its own: the server resumes the run once a chat has none left. `pending` is the shared list without the approvals
 * answered here, until the refreshed list drops them too, so an answered one is never offered again.
 */
export function useAnswer() {
  const { approvals, refreshApprovals } = useLive();
  const { t } = useSettings();
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string>();

  // Once the server's list no longer has an answered approval, there is nothing left to hide.
  useEffect(() => {
    setAnswered((current) => {
      const still = [...current].filter((id) => approvals.some((entry) => entry.interruptId === id));
      return still.length === current.size ? current : new Set(still);
    });
  }, [approvals]);

  const answer = async (entry: PendingApprovalEntry, decision: Decision) => {
    setBusy((current) => new Set([...current, entry.interruptId]));
    setError(undefined);
    try {
      await api.answer(entry.threadId, [{ interruptId: entry.interruptId, decisions: entry.requests.map(() => decision) }]);
      setAnswered((current) => new Set([...current, entry.interruptId]));
    } catch (reason) {
      setError(friendlyError(reason, t));
    } finally {
      setBusy((current) => without(current, entry.interruptId));
      refreshApprovals();
    }
  };

  const pending = answered.size === 0 ? approvals : approvals.filter((entry) => !answered.has(entry.interruptId));
  const isBusy = (interruptId: string) => busy.has(interruptId);
  return { answer, pending, isBusy, error };
}
