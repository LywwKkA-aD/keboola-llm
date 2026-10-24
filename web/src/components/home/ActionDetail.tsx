import { Link } from 'react-router';
import type { StringKey } from '../../i18n/strings.ts';
import { actionBadge, actionStatus, actionTitle, actionView } from '../../lib/actions.ts';
import { formatClock } from '../../lib/format.ts';
import type { FeedItem } from '../../live/live-state.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import { PROMOTE_TOOL, RequestDetails } from '../approvals/RequestDetails.tsx';
import { ActionBody, Field } from '../ActionBody.tsx';

/** A tool's result: its preview once it ended, a note while it runs. */
function Result({ item }: { item: FeedItem }) {
  const { t } = useSettings();
  return (
    <Field label="chat.result">
      {item.result ? (
        <pre className={`request__code${item.result.ok ? '' : ' action-detail__failed'}`}>{item.result.preview || '—'}</pre>
      ) : (
        <p className="muted">{t('action.noResult')}</p>
      )}
    </Field>
  );
}

/** Opens the chat of the action: in the Home popup when the page offers it, as a link otherwise. */
function ChatButton({ threadId, label, primary = false, onOpenChat }: { threadId: string; label: string; primary?: boolean; onOpenChat?: ((threadId: string) => void) | undefined }) {
  const className = `btn btn--small${primary ? ' btn--primary' : ''}`;
  return onOpenChat ? (
    <button type="button" className={className} onClick={() => onOpenChat(threadId)}>
      {label}
    </button>
  ) : (
    <Link className={className} to={`/chat/${threadId}`}>
      {label}
    </Link>
  );
}

/** One action of an agent in full, in place of the card's overview; Back returns to it. */
export function ActionDetail({ item, viewer, onBack, onOpenChat }: {
  item: FeedItem | undefined;
  viewer: string;
  onBack: () => void;
  onOpenChat?: ((threadId: string) => void) | undefined;
}) {
  const { t, settings } = useSettings();
  const { approvals } = useLive();
  const back = (
    <button type="button" className="btn btn--ghost btn--small action-detail__back" onClick={onBack}>
      {t('action.back')}
    </button>
  );
  if (!item) {
    return (
      <section className="panel-section action-detail" aria-label={t('action.detail')}>
        {back}
        <p className="empty">{t('action.gone')}</p>
      </section>
    );
  }

  const badge = actionBadge(item);
  const title = actionTitle(item, viewer);
  const status = actionStatus(item, approvals);
  const promotion = item.kind === 'approval' && item.target === PROMOTE_TOOL;
  return (
    <section className="panel-section action-detail" aria-label={t('action.detail')}>
      {back}
      <div className="action-detail__meta">
        <span className={`chip${badge.tone ? ` chip--${badge.tone}` : ''}`}>{t(badge.key)}</span>
        <time className="mono muted">{formatClock(item.at, settings.language)}</time>
        <span className={`action-status action-status--${status} action-status--shown`}>
          <span className="action-status__label">{t(`action.${status}` as StringKey)}</span>
        </span>
      </div>
      <h3 className="action-detail__title">
        {title.verb && <span className="muted">{t(title.verb)} </span>}
        {title.text || item.target}
      </h3>
      {status === 'waiting' && (
        <div className="notice action-detail__waiting">
          <span>{t('action.waiting')}</span>
          <ChatButton threadId={item.threadId} label={t('action.answerApproval')} primary onOpenChat={onOpenChat} />
        </div>
      )}
      {promotion ? <RequestDetails request={{ tool: item.target, args: item.args ?? {}, decisions: [] }} /> : <ActionBody view={actionView(item)} />}
      {item.kind === 'tool' && <Result item={item} />}
      <div className="action-detail__foot">
        <ChatButton threadId={item.threadId} label={t('action.openChat')} onOpenChat={onOpenChat} />
      </div>
    </section>
  );
}
