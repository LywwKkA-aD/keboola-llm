import { type ReactNode, useId, useRef } from 'react';
import { Link } from 'react-router';
import type { StringKey } from '../../i18n/strings.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import { useTeam } from '../../state/team-context.tsx';
import { ApprovalsPanel } from './ApprovalsPanel.tsx';
import { ChatsPanel } from './ChatsPanel.tsx';
import { HudPanel } from './HudPanel.tsx';
import { HudStats } from './HudStats.tsx';
import { TeamList } from './TeamList.tsx';

export type HudPanelName = 'team' | 'chats' | 'approvals';

const LABELS: Record<HudPanelName, StringKey> = { team: 'home.team', chats: 'nav.chats', approvals: 'nav.approvals' };
const ORDER: readonly HudPanelName[] = ['team', 'chats', 'approvals'];

/** The slim bar over the aquarium (stats, Team, Chats, Approvals) and the one panel open under it. */
export function HomeHud({ panel, onPanel, selected, onSelect, onOpenChat }: {
  panel: HudPanelName | undefined;
  onPanel: (panel: HudPanelName | undefined) => void;
  selected: string | undefined;
  onSelect: (name: string | undefined) => void;
  onOpenChat: (threadId: string) => void;
}) {
  const { t } = useSettings();
  const team = useTeam();
  const { approvals, state, now } = useLive();
  const panelId = useId();
  const triggers = useRef<Partial<Record<HudPanelName, HTMLButtonElement | null>>>({});
  const close = () => onPanel(undefined);

  const content = (name: HudPanelName): { body: ReactNode; footer?: ReactNode } => {
    switch (name) {
      case 'team':
        return { body: <TeamList agents={team.agents} state={state} now={now} {...(selected ? { selected } : {})} onSelect={onSelect} /> };
      case 'chats':
        return { body: <ChatsPanel onOpen={onOpenChat} />, footer: <Link to="/chat">{t('home.allChats')}</Link> };
      case 'approvals':
        return { body: <ApprovalsPanel onOpen={onOpenChat} />, footer: <Link to="/approvals">{t('home.allApprovals')}</Link> };
    }
  };
  const open = panel ? content(panel) : undefined;

  return (
    <section className="hud" aria-label={t('home.overview')}>
      <div className="hud-surface hud__bar">
        <HudStats />
        <div className="hud__buttons">
          {ORDER.map((name) => {
            const amber = name === 'approvals' && approvals.length > 0;
            return (
              <button
                key={name}
                ref={(node) => {
                  triggers.current[name] = node;
                }}
                type="button"
                className={`btn btn--small hud__btn${panel === name ? ' hud__btn--on' : ''}${amber ? ' hud__btn--amber' : ''}`}
                aria-expanded={panel === name}
                aria-controls={panel === name ? panelId : undefined}
                onClick={() => onPanel(panel === name ? undefined : name)}
              >
                {t(LABELS[name])}
                {name === 'approvals' && (
                  <>
                    {' '}
                    <span className="hud__count">{approvals.length}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {panel && open && (
        <HudPanel
          key={panel}
          id={panelId}
          title={t(LABELS[panel])}
          onClose={close}
          onReturnFocus={() => triggers.current[panel]?.focus()}
          {...(open.footer ? { footer: open.footer } : {})}
        >
          {open.body}
        </HudPanel>
      )}
    </section>
  );
}
