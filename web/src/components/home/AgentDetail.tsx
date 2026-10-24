import { type ReactNode, useState } from 'react';
import type { AgentInfo } from '../../api/types.ts';
import { type AgentState, moodOf } from '../../aquarium/state.ts';
import type { StringKey } from '../../i18n/strings.ts';
import { groupOf } from '../../lib/agent-groups.ts';
import { splitDisabled } from '../../lib/disabled-reason.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import { ActionDetail } from './ActionDetail.tsx';
import { ActionList } from './ActionList.tsx';
import { moodDot } from './mood.ts';
import '../agents/agents.css';

/** How many of an agent's latest actions the card lists. */
const RECENT = 20;

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

/**
 * A selected agent: who it is, what it is doing now and its recent actions. An action opens in place of the overview
 * (the diff of an edit, the query, the task and its reply), with Back to return. Children go below the role.
 */
export function AgentDetail({ agent, current, now, onClose, onOpenChat, children }: {
  agent: AgentInfo;
  current: AgentState | undefined;
  now: number;
  onClose: () => void;
  /** Opens a chat over the page (Home); without it the action links to the chat. */
  onOpenChat?: (threadId: string) => void;
  children?: ReactNode;
}) {
  const { t } = useSettings();
  const { live } = useLive();
  // The open action belongs to the agent it was opened for: selecting another agent shows that one's overview.
  const [opened, setOpened] = useState<{ agent: string; id: string }>();
  const openId = opened?.agent === agent.name ? opened.id : undefined;
  const mood = moodOf(current, now);
  const recent = live.feed.filter((item) => item.agent === agent.name || (item.kind === 'delegate' && item.target === agent.name)).slice(0, RECENT);
  const { role, reason } = splitDisabled(agent.description);

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
          {mood !== 'idle' && current?.label && <span className="muted agent-detail__label"> · {current.label}</span>}
        </div>
      </div>
      {openId ? (
        <ActionDetail item={live.feed.find((item) => item.id === openId)} viewer={agent.name} onBack={() => setOpened(undefined)} onOpenChat={onOpenChat} />
      ) : (
        <>
          <div className="panel-section">
            {!agent.enabled && (
              <div className="notice agent-detail__disabled">
                <span className="label">{t('agents.whyDisabled')}</span>
                <p>{reason ?? t('agents.disabledNoReason')}</p>
              </div>
            )}
            <p className="agent-detail__description">{agent.enabled ? agent.description : role}</p>
            <details className="agent-detail__about">
              <summary className="label">{t('action.about')}</summary>
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
            </details>
          </div>
          {children}
          <div className="panel-section">
            <div className="panel-section__head">
              <span className="label">{t('home.recent')}</span>
            </div>
            <ActionList items={recent} viewer={agent.name} label={t('home.recent')} onOpen={(id) => setOpened({ agent: agent.name, id })} />
          </div>
        </>
      )}
    </div>
  );
}
