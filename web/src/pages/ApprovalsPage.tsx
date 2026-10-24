import { useState } from 'react';
import { Link } from 'react-router';
import { RequestDetails, requestLabel } from '../components/approvals/RequestDetails.tsx';
import { useAnswer } from '../components/approvals/useAnswer.ts';
import { shortName } from '../components/home/mood.ts';
import { useLive } from '../live/live-context.tsx';
import { useSettings } from '../state/settings-context.tsx';

/** Every agent action waiting for the user, across all chats: pick one on the left, decide on the right. */
export function ApprovalsPage() {
  const { t } = useSettings();
  const { approvals } = useLive();
  const { answer, busy, error } = useAnswer();
  const [selectedId, setSelectedId] = useState<string>();
  const [comment, setComment] = useState('');
  const selected = approvals.find((entry) => entry.interruptId === selectedId) ?? approvals[0];

  const decide = async (approve: boolean) => {
    if (!selected) return;
    const message = comment.trim() || 'The user rejected this action.';
    await answer(selected, approve ? { type: 'approve' } : { type: 'reject', message });
    setComment('');
    setSelectedId(undefined);
  };

  return (
    <div className="page">
      <header className="page__head">
        <span className="label">{t('approvals.label')}</span>
        <h1 className="page__title">{t('approvals.title')}</h1>
      </header>
      {approvals.length === 0 ? (
        <p className="empty">{t('approvals.none')}</p>
      ) : (
        <div className="split">
          <div className="split__list">
            <span className="label">{t('approvals.pending')}</span>
            <ul className="approval-list">
              {approvals.map((entry) => (
                <li key={entry.interruptId}>
                  <button
                    type="button"
                    className={`approval-item${entry === selected ? ' approval-item--selected' : ''}`}
                    aria-pressed={entry === selected}
                    onClick={() => setSelectedId(entry.interruptId)}
                  >
                    <span className="approval-item__chips">
                      <span className="chip chip--amber">{t('approval.title')}</span>
                      <span className="chip">{entry.requests[0]?.tool}</span>
                    </span>
                    <span className="approval-item__title">{entry.threadTitle}</span>
                    {entry.requests[0]?.agent && <span className="label">{shortName(entry.requests[0].agent)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {selected && (
            <section className="split__detail" aria-label={t('approval.title')}>
              <div className="approval-detail__head">
                <span className="chip chip--amber">{t('approval.title')}</span>
                <Link to={`/chat/${selected.threadId}`}>{t('approvals.openChat')}</Link>
              </div>
              <dl className="facts">
                <dt className="label">{t('approvals.chat')}</dt>
                <dd>{selected.threadTitle}</dd>
                {selected.requests[0]?.agent && (
                  <>
                    <dt className="label">{t('approvals.agent')}</dt>
                    <dd>{selected.requests[0].agent}</dd>
                  </>
                )}
              </dl>
              <span className="label">{t('approvals.params')}</span>
              {selected.requests.map((request, index) => (
                <div key={`${selected.interruptId}-${index}`} className="approval-detail__request">
                  <div className="mono">{requestLabel(request, t)}</div>
                  <RequestDetails request={request} />
                </div>
              ))}
              {error && <div className="error-banner">{error}</div>}
              <label className="field">
                <span className="label">{t('approvals.comment')}</span>
                <textarea className="textarea" rows={3} placeholder={t('approvals.commentPlaceholder')} value={comment} onChange={(event) => setComment(event.target.value)} />
              </label>
              <div className="approval-detail__actions">
                <button type="button" className="btn btn--primary" disabled={busy === selected.interruptId} onClick={() => void decide(true)}>
                  {t('approval.approve')}
                </button>
                <button type="button" className="btn btn--danger" disabled={busy === selected.interruptId} onClick={() => void decide(false)}>
                  {t('approval.reject')}
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
