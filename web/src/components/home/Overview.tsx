import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.ts';
import type { Thread } from '../../api/types.ts';
import { formatTokens } from '../../lib/format.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import { RequestDetails } from '../approvals/RequestDetails.tsx';
import { useAnswer } from '../approvals/useAnswer.ts';
import { FeedList } from './FeedList.tsx';
import { OnboardingCard } from './OnboardingCard.tsx';
import { RoutineRuns } from './RoutineRuns.tsx';
import { shortName } from './mood.ts';

function Stat({ value, label, tone = '' }: { value: string | number; label: string; tone?: string }) {
  return (
    <div className="stat">
      <span className={`stat__value${tone ? ` stat__value--${tone}` : ''}`}>{value}</span>
      <span className="label">{label}</span>
    </div>
  );
}

/** The right panel with nothing selected: what runs, what waits, what just happened. */
export function Overview({ enabledAgents }: { enabledAgents: number }) {
  const { t } = useSettings();
  const { live, approvals } = useLive();
  const { answer, busy, error } = useAnswer();
  const [threads, setThreads] = useState<readonly Thread[]>([]);
  const runningKey = live.running.join(',');

  useEffect(() => {
    api.threads().then(setThreads).catch(() => {});
  }, [runningKey]);

  const titleOf = (id: string) => threads.find((thread) => thread.id === id)?.title ?? id.slice(0, 8);

  return (
    <div className="overview">
      <OnboardingCard />
      <div className="stats">
        <Stat value={live.running.length} label={t('top.runs')} tone={live.running.length ? 'blue' : ''} />
        <Stat value={approvals.length} label={t('top.waiting')} tone={approvals.length ? 'amber' : ''} />
        <Stat value={enabledAgents} label={t('nav.agents')} />
        <Stat value={formatTokens(live.usage.input + live.usage.output)} label={t('home.usage')} />
      </div>

      <section className="panel-section">
        <div className="panel-section__head">
          <span className="label">{t('home.activeRuns')}</span>
          <span className="label">{live.running.length}</span>
        </div>
        {live.running.length === 0 ? (
          <p className="empty">{t('home.noRuns')}</p>
        ) : (
          <ul className="run-list">
            {live.running.map((id) => (
              <li key={id}>
                <span className="dot dot--blue dot--pulse" />
                <Link to={`/chat/${id}`}>{titleOf(id)}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel-section">
        <div className="panel-section__head">
          <span className="label">{t('home.approvals')}</span>
          <span className="label">{approvals.length}</span>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {approvals.length === 0 ? (
          <p className="empty">{t('home.noApprovals')}</p>
        ) : (
          approvals.map((entry) => (
            <article key={entry.interruptId} className="mini-approval">
              <div className="mini-approval__head">
                <span className="chip chip--amber">{entry.requests[0]?.tool}</span>
                {entry.requests[0]?.agent && <span className="muted">{shortName(entry.requests[0].agent)}</span>}
              </div>
              <Link className="mini-approval__chat" to={`/chat/${entry.threadId}`}>
                {entry.threadTitle}
              </Link>
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
                  onClick={() => void answer(entry, { type: 'reject', message: 'The user rejected this action.' })}
                >
                  {t('approval.reject')}
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <RoutineRuns />

      <section className="panel-section">
        <div className="panel-section__head">
          <span className="label">{t('home.feed')}</span>
        </div>
        <FeedList items={live.feed.slice(0, 25)} empty={t('home.noFeed')} />
      </section>

      <section className="panel-section">
        <div className="panel-section__head">
          <span className="label">{t('home.usage')}</span>
        </div>
        <dl className="usage">
          <dt className="label">{t('home.input')}</dt>
          <dd className="mono">{formatTokens(live.usage.input)}</dd>
          <dt className="label">{t('home.cached')}</dt>
          <dd className="mono">{formatTokens(live.usage.cached)}</dd>
          <dt className="label">{t('home.output')}</dt>
          <dd className="mono">{formatTokens(live.usage.output)}</dd>
        </dl>
      </section>
    </div>
  );
}
