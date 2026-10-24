import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import { RequestDetails, requestLabel } from '../approvals/RequestDetails.tsx';
import { useAnswer } from '../approvals/useAnswer.ts';
import { shortName } from './mood.ts';

const REJECTED = 'The user rejected this action.';

/** Approvals panel: every pending agent action with what it would do, approved or rejected in place. */
export function ApprovalsPanel({ onOpen }: { onOpen: (threadId: string) => void }) {
  const { t } = useSettings();
  const { approvals } = useLive();
  const { answer, busy, error } = useAnswer();

  if (approvals.length === 0) return <p className="empty">{t('home.noApprovals')}</p>;
  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      {approvals.map((entry) => {
        const first = entry.requests[0];
        return (
          <article key={entry.interruptId} className="mini-approval">
            <div className="mini-approval__head">
              <span className="chip chip--amber">{first ? requestLabel(first, t) : ''}</span>
              {first?.agent && <span className="muted">{shortName(first.agent)}</span>}
            </div>
            <button type="button" className="mini-approval__chat" onClick={() => onOpen(entry.threadId)}>
              {entry.threadTitle}
            </button>
            {entry.requests.map((request, index) => (
              <RequestDetails key={`${entry.interruptId}-${index}`} request={request} compact />
            ))}
            <div className="mini-approval__actions">
              <button type="button" className="btn btn--primary btn--small" disabled={busy === entry.interruptId} onClick={() => void answer(entry, { type: 'approve' })}>
                {t('approval.approve')}
              </button>
              <button
                type="button"
                className="btn btn--danger btn--small"
                disabled={busy === entry.interruptId}
                onClick={() => void answer(entry, { type: 'reject', message: REJECTED })}
              >
                {t('approval.reject')}
              </button>
            </div>
          </article>
        );
      })}
    </>
  );
}
