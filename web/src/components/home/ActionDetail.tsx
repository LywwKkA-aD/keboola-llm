import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { StringKey } from '../../i18n/strings.ts';
import { type ActionView, actionBadge, actionStatus, actionTitle, actionView } from '../../lib/actions.ts';
import { formatClock } from '../../lib/format.ts';
import type { FeedItem } from '../../live/live-state.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import { PROMOTE_TOOL, RequestDetails } from '../approvals/RequestDetails.tsx';
import { Markdown } from '../Markdown.tsx';
import { DiffView } from '../versions/DiffView.tsx';
import './actions.css';

function Field({ label, children }: { label: StringKey; children: ReactNode }) {
  const { t } = useSettings();
  return (
    <div className="action-field">
      <span className="label">{t(label)}</span>
      {children}
    </div>
  );
}

const Code = ({ children }: { children: string }) => <pre className="request__code">{children}</pre>;

/** The body of an action: a diff for an edit, the content of a written file, the command or query, the task. The title above already says its purpose. */
function ViewBody({ view }: { view: ActionView }) {
  const { t } = useSettings();
  switch (view.type) {
    case 'diff':
      return (
        <>
          <div className="action-detail__path mono">{view.path}</div>
          <DiffView before={view.before} after={view.after} label={t('action.change')} />
        </>
      );
    case 'file':
      return (
        <>
          <div className="action-detail__path mono">{view.path}</div>
          <Field label="action.content">
            <Code>{view.content}</Code>
          </Field>
        </>
      );
    case 'command':
      return (
        <Field label="action.command">
          <Code>{view.command}</Code>
        </Field>
      );
    case 'sql':
      return (
        <>
          <Field label="action.query">
            <Code>{view.sql}</Code>
          </Field>
          <div className="action-detail__command mono muted">{view.command}</div>
        </>
      );
    case 'lookup':
      return (
        <>
          <Field label="action.target">
            <div className="mono">{view.target}</div>
          </Field>
          {view.pattern && (
            <Field label="action.pattern">
              <div className="mono">{view.pattern}</div>
            </Field>
          )}
        </>
      );
    case 'delegation':
      return (
        <>
          <div className="action-detail__path">
            {view.from} → {view.to}
          </div>
          <Field label="action.task">
            <p className="action-detail__text">{view.task}</p>
          </Field>
          <Field label="action.reply">
            {view.answer ? <Markdown className="message__markdown" text={view.answer} /> : <p className="muted">{t('action.noResult')}</p>}
          </Field>
        </>
      );
    case 'todos':
      return (
        <ul className="plan-list" aria-label={t('kind.plan')}>
          {view.todos.map((todo, index) => {
            const status = todo.status === 'completed' || todo.status === 'in_progress' ? todo.status : 'pending';
            return (
              <li key={index} className={`plan-list__item plan-list__item--${status}`}>
                <span className="plan-list__status">{t(`plan.${status}` as StringKey)}:</span> {String(todo.content ?? '')}
              </li>
            );
          })}
        </ul>
      );
    case 'plan':
      return (
        <>
          {view.title && <p className="action-detail__purpose">{view.title}</p>}
          {view.plan && <Markdown className="message__markdown" text={view.plan} />}
        </>
      );
    case 'error':
      return <p className="action-detail__error">{view.text}</p>;
    case 'raw':
      return (
        <Field label="chat.args">
          <Code>{JSON.stringify(view.args, null, 2)}</Code>
        </Field>
      );
    case 'none':
      return null;
  }
}

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
      {promotion ? <RequestDetails request={{ tool: item.target, args: item.args ?? {}, decisions: [] }} /> : <ViewBody view={actionView(item)} />}
      {item.kind === 'tool' && <Result item={item} />}
      <div className="action-detail__foot">
        <ChatButton threadId={item.threadId} label={t('action.openChat')} onOpenChat={onOpenChat} />
      </div>
    </section>
  );
}
