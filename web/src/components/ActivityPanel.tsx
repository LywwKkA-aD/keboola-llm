import { agentColor, useTeam } from '../state/team-context.tsx';
import { useSettings } from '../state/settings-context.tsx';
import type { RunState } from '../state/run-state.ts';
import { AgentAvatar } from './AgentAvatar.tsx';

const ARROW = { delegate: '→', tool: '·', auto: '⇢' } as const;
const STATUS_MARK = { running: '…', done: '✓', failed: '✕' } as const;

export function ActivityPanel({ run }: { run: RunState }) {
  const { t } = useSettings();
  const team = useTeam();
  const recent = run.activities.slice(-60).toReversed();

  return (
    <aside className="activity" aria-label={t('activity.title')}>
      <h2 className="activity__title">{t('activity.title')}</h2>
      {run.usage.input > 0 && (
        <div className="activity__usage">
          {t('activity.tokens')}: {run.usage.input.toLocaleString()} ({run.usage.cached.toLocaleString()} {t('activity.cached')}) /{' '}
          {run.usage.output.toLocaleString()}
        </div>
      )}
      {recent.length === 0 ? (
        <p className="activity__empty">{t('activity.empty')}</p>
      ) : (
        <ol className="activity__list">
          {recent.map((activity) => (
            <li key={activity.id} className={`activity__item activity__item--${activity.status}`}>
              <AgentAvatar name={activity.agent} color={agentColor(team, activity.agent)} size={22} busy={activity.status === 'running'} />
              <div className="activity__body">
                <div className="activity__head">
                  <span className="activity__agent">{activity.agent}</span>
                  <span className="activity__arrow">{ARROW[activity.kind]}</span>
                  <span className="activity__target">{activity.target}</span>
                  <span className="activity__status">{STATUS_MARK[activity.status]}</span>
                </div>
                <div className="activity__label">{activity.label}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
