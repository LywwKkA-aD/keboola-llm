import type { ApprovalRequest, Decision } from '../api/types.ts';
import { useSettings } from '../state/settings-context.tsx';
import type { PendingApproval } from '../state/run-state.ts';

function RequestDetails({ request }: { request: ApprovalRequest }) {
  const { args } = request;
  if (typeof args.file_path === 'string') {
    const body = typeof args.content === 'string' ? args.content : JSON.stringify(args, null, 2);
    return (
      <>
        <div className="approval__target">{args.file_path}</div>
        <pre className="approval__code">{body}</pre>
      </>
    );
  }
  if (Array.isArray(args.args)) {
    return (
      <>
        {typeof args.purpose === 'string' && <div className="approval__purpose">{args.purpose}</div>}
        <pre className="approval__code">kbagent {args.args.join(' ')}</pre>
      </>
    );
  }
  return <pre className="approval__code">{JSON.stringify(args, null, 2)}</pre>;
}

export function ApprovalCard({ approval, onAnswer, busy }: {
  approval: PendingApproval;
  onAnswer: (decisions: Decision[]) => void;
  busy: boolean;
}) {
  const { t } = useSettings();
  const all = (decision: Decision) => approval.requests.map(() => decision);
  return (
    <section className="approval" aria-label={t('approval.title')}>
      <header className="approval__header">{t('approval.title')}</header>
      {approval.requests.map((request, index) => (
        <div className="approval__request" key={`${approval.interruptId}-${index}`}>
          <div className="approval__tool">{request.tool}</div>
          <RequestDetails request={request} />
        </div>
      ))}
      <div className="approval__actions">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => onAnswer(all({ type: 'approve' }))}>
          {t('approval.approve')}
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={busy}
          onClick={() => onAnswer(all({ type: 'reject', message: 'The user rejected this action.' }))}
        >
          {t('approval.reject')}
        </button>
      </div>
    </section>
  );
}
