import { useState } from 'react';
import { AquariumView } from '../aquarium3d/AquariumView.tsx';
import { AgentDetail } from '../components/home/AgentDetail.tsx';
import { AskTeam } from '../components/home/AskTeam.tsx';
import { Overview } from '../components/home/Overview.tsx';
import { TeamPanel } from '../components/home/TeamPanel.tsx';
import { useLive } from '../live/live-context.tsx';
import { useSettings } from '../state/settings-context.tsx';
import { useTeam } from '../state/team-context.tsx';

/** Home: the team on the left, the 3D aquarium in the middle, overview or agent details on the right. */
export function HomePage() {
  const { t, settings, appearance } = useSettings();
  const team = useTeam();
  const { state, now } = useLive();
  const [selected, setSelected] = useState<string>();
  const enabled = team.agents.filter((agent) => agent.enabled);
  const agent = team.agents.find((entry) => entry.name === selected);

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
    <div className="home">
      <TeamPanel agents={team.agents} state={state} now={now} selected={selected} onSelect={setSelected} />
      <section className="home__stage" aria-label={t('nav.home')}>
        <AquariumView {...sceneProps} />
        <p className="home__hint label">{t('home.hint')}</p>
        <AskTeam />
      </section>
      <aside className="home__side">
        {agent ? (
          <AgentDetail agent={agent} current={state.agents[agent.name]} now={now} onClose={() => setSelected(undefined)} />
        ) : (
          <Overview enabledAgents={enabled.length} />
        )}
      </aside>
    </div>
  );
}
