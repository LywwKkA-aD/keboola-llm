import { useState } from 'react';
import { AquariumView } from '../aquarium3d/AquariumView.tsx';
import { AgentDetail } from '../components/home/AgentDetail.tsx';
import { AskTeam } from '../components/home/AskTeam.tsx';
import { ChatPopup } from '../components/home/ChatPopup.tsx';
import { HomeHud, type HudPanelName } from '../components/home/HomeHud.tsx';
import { OnboardingCard } from '../components/home/OnboardingCard.tsx';
import { useEscape } from '../hooks/useEscape.ts';
import { useLive } from '../live/live-context.tsx';
import { useSettings } from '../state/settings-context.tsx';
import { useTeam } from '../state/team-context.tsx';

/**
 * Home: the 3D aquarium fills the page; a slim HUD, the setup card, the selected agent, the chat popup and
 * the composer float over it. Escape closes the topmost layer: a HUD panel, then the chat, then the agent.
 */
export function HomePage() {
  const { t, settings, appearance } = useSettings();
  const team = useTeam();
  const { state, now } = useLive();
  const [selected, setSelected] = useState<string>();
  const [panel, setPanel] = useState<HudPanelName>();
  const [chatId, setChatId] = useState<string>();
  const enabled = team.agents.filter((agent) => agent.enabled);
  const agent = team.agents.find((entry) => entry.name === selected);

  const openChat = (threadId: string) => {
    setPanel(undefined);
    setChatId(threadId);
  };
  const closeTop = () => {
    if (panel) setPanel(undefined);
    else if (chatId) setChatId(undefined);
    else setSelected(undefined);
  };
  useEscape(closeTop, Boolean(panel || chatId || agent));

  // reducedMotion is not in the scene contract on every branch; spread props are not excess-checked.
  const sceneProps = {
    agents: enabled,
    lead: team.lead,
    state,
    now,
    selected,
    onSelect: setSelected,
    quality: settings.quality,
    reducedMotion: appearance.reducedMotion,
  };

  return (
    <div className={`home${chatId ? ' home--chat' : ''}`}>
      <div className="home__scene">
        <AquariumView {...sceneProps} />
      </div>
      <AskTeam onStarted={openChat} />
      <div className="home__overlay">
        <div className="home__left">
          <OnboardingCard onOpenChat={openChat} />
          {agent ? (
            <aside className="hud-surface agent-card" aria-label={agent.name}>
              <AgentDetail agent={agent} current={state.agents[agent.name]} now={now} onClose={() => setSelected(undefined)} />
            </aside>
          ) : (
            <p className="home__hint">{t('home.hint')}</p>
          )}
        </div>
        <div className="home__right">
          <HomeHud panel={panel} onPanel={setPanel} selected={selected} onSelect={setSelected} onOpenChat={openChat} />
          {chatId && <ChatPopup key={chatId} threadId={chatId} onClose={() => setChatId(undefined)} />}
        </div>
      </div>
    </div>
  );
}
