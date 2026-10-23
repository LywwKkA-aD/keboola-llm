import type { TeamInfo } from '../api/types.ts';
import { Scene } from '../aquarium/Scene.tsx';
import { moodOf } from '../aquarium/state.ts';
import { useAquariumEvents } from '../aquarium/useAquariumEvents.ts';
import type { StringKey } from '../i18n/strings.ts';
import { useSettings } from '../state/settings-context.tsx';
import { useTeam } from '../state/team-context.tsx';

function Aquarium({ team }: { team: TeamInfo }) {
  const { t } = useSettings();
  const { state, now } = useAquariumEvents(team.lead);
  const agents = team.agents.filter((agent) => agent.enabled);
  const active = agents
    .map((agent) => ({ agent, mood: moodOf(state.agents[agent.name], now), label: state.agents[agent.name]?.label ?? '' }))
    .filter(({ mood }) => mood !== 'idle');

  return (
    <div className="aquarium-page">
      <Scene agents={agents} lead={team.lead} state={state} now={now} label={t('nav.aquarium')} />
      <aside className="aquarium-page__live" aria-live="polite">
        <h2 className="activity__title">{t('aquarium.live')}</h2>
        {active.length === 0 ? (
          <p className="activity__empty">{t('aquarium.nobody')}</p>
        ) : (
          <ul className="aquarium-page__list">
            {active.map(({ agent, mood, label }) => (
              <li key={agent.name}>
                <span className="aquarium-page__dot" style={{ background: agent.avatar?.color }} />
                <strong>{agent.name}</strong> {t(`mood.${mood}` as StringKey)}
                {label && <div className="aquarium-page__label">{label}</div>}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

export function AquariumPage() {
  const team = useTeam();
  // Keyed by the lead: the aquarium state remembers the lead name, known only after /api/team.
  return <Aquarium key={team.lead} team={team} />;
}
