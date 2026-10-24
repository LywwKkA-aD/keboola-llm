import type { ReactNode } from 'react';
import type { StringKey } from '../i18n/strings.ts';
import type { ActionView } from '../lib/actions.ts';
import { useSettings } from '../state/settings-context.tsx';
import { Markdown } from './Markdown.tsx';
import { DiffView } from './versions/DiffView.tsx';
import './home/actions.css';

export function Field({ label, children }: { label: StringKey; children: ReactNode }) {
  const { t } = useSettings();
  return (
    <div className="action-field">
      <span className="label">{t(label)}</span>
      {children}
    </div>
  );
}

export const Code = ({ children }: { children: string }) => <pre className="request__code">{children}</pre>;

/**
 * The body of an action: a diff for an edit, the content of a written file, the command or query, the task. Shared by
 * the agent card and the chat's steps; `reply` leaves out a delegate's answer where the chat shows it anyway.
 */
export function ActionBody({ view, reply = true }: { view: ActionView; reply?: boolean }) {
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
          {reply && (
            <Field label="action.reply">
              {view.answer ? <Markdown className="message__markdown" text={view.answer} /> : <p className="muted">{t('action.noResult')}</p>}
            </Field>
          )}
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
