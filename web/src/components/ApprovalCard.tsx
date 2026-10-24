import type { Decision } from '../api/types.ts';
import type { PendingApproval } from '../state/run-state.ts';
import { useSettings } from '../state/settings-context.tsx';
import { RequestDetails, requestLabel } from './approvals/RequestDetails.tsx';
import { shortName } from './home/mood.ts';

export function ApprovalCard({ approval, onAnswer, busy }: {
  approval: PendingApproval;
  onAnswer: (decisions: Decision[]) => void;
  busy: boolean;
}) {
  const { t } = useSettings();
  const all = (decision: Decision) => approval.requests.map(() => decision);
  return (
    <section className="approval" aria-label={t('approval.title')}>
      <header className="approval__header">
        <span className="chip chip--amber">{t('approval.title')}</span>
      </header>
      {approval.requests.map((request, index) => (
        <div className="approval__request" key={`${approval.interruptId}-${index}`}>
          <div className="approval__tool mono">
            {requestLabel(request, t)}
            {request.agent && <span className="muted"> · {shortName(request.agent)}</span>}
          </div>
          <RequestDetails request={request} />
        </div>
      ))}
      <div className="approval__actions">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => onAnswer(all({ type: 'approve' }))}>
          {t('approval.approve')}
        </button>
        <button type="button" className="btn btn--danger" disabled={busy} onClick={() => onAnswer(all({ type: 'reject', message: 'The user rejected this action.' }))}>
          {t('approval.reject')}
        </button>
      </div>
    </section>
  );
}
