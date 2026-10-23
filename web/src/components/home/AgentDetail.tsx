import type { ReactNode } from 'react';
import type { AgentInfo } from '../../api/types.ts';
import { type AgentState, moodOf } from '../../aquarium/state.ts';
import type { StringKey } from '../../i18n/strings.ts';
import { groupOf } from '../../lib/agent-groups.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import { FeedList } from './FeedList.tsx';
import { moodDot } from './mood.ts';

function Fact({ label, children }: { label: StringKey; children: ReactNode }) {
  const { t } = useSettings();
  return (
    <>
      <dt className="label">{t(label)}</dt>
      <dd>{children}</dd>
    </>
  );
}

const list = (items: readonly string[], none: string) => (items.length ? items.join(', ') : none);

/** The right panel for a selected agent: what it is for, what it may do, what it is doing. */
export function AgentDetail({ agent, current, now, onClose }: {
  agent: AgentInfo;
  current: AgentState | undefined;
  now: number;
  onClose: () => void;
}) {
  const { t } = useSettings();
  const { live } = useLive();
  const mood = moodOf(current, now);
  const recent = live.feed.filter((item) => item.agent === agent.name || item.target === agent.name).slice(0, 15);

  return (
    <div className="agent-detail">
      <div className="panel-section">
        <div className="panel-section__head">
          <span className="label">{t(`group.${groupOf(agent)}` as StringKey)}</span>
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose} aria-label={t('home.close')}>
            {t('home.close')}
          </button>
        </div>
        <h2 className="agent-detail__name">{agent.name}</h2>
        <div className="agent-detail__now">
          <span className={moodDot(mood)} />
          <span>{t(`mood.${mood}` as StringKey)}</span>
          {mood !== 'idle' && current?.label && <span className="muted"> · {current.label}</span>}
        </div>
      </div>
      <div className="panel-section">
        <span className="label">{t('home.role')}</span>
        <p className="agent-detail__description">{agent.description}</p>
        <dl className="facts">
          <Fact label="agents.access">{agent.access ? t(`access.${agent.access}` as StringKey) : t('agents.none')}</Fact>
          <Fact label="agents.skills">{list(agent.skills, t('agents.none'))}</Fact>
          <Fact label="agents.tools">{list(agent.tools, t('agents.none'))}</Fact>
          {agent.basedOn && (
            <Fact label="agents.basedOn">
              <span className="mono">{agent.basedOn}</span>
            </Fact>
          )}
        </dl>
      </div>
      <div className="panel-section">
        <div className="panel-section__head">
          <span className="label">{t('home.recent')}</span>
        </div>
        <FeedList items={recent} empty={t('home.noFeed')} />
      </div>
    </div>
  );
}
