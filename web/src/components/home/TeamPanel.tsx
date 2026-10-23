import type { AgentInfo } from '../../api/types.ts';
import { type AquariumState, moodOf } from '../../aquarium/state.ts';
import type { StringKey } from '../../i18n/strings.ts';
import { groupTeam } from '../../lib/agent-groups.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { moodDot, roleHint, shortName } from './mood.ts';

export function TeamPanel({ agents, state, now, selected, onSelect }: {
  agents: readonly AgentInfo[];
  state: AquariumState;
  now: number;
  selected?: string;
  onSelect: (name: string | undefined) => void;
}) {
  const { t } = useSettings();
  const groups = groupTeam(agents);
  const enabled = agents.filter((agent) => agent.enabled).length;

  return (
    <nav className="team-panel" aria-label={t('home.team')}>
      <div className="team-panel__head">
        <span className="label">{t('home.team')}</span>
        <span className="label mono">{String(enabled).padStart(2, '0')}</span>
      </div>
      {groups.map(({ group, agents: members }) => (
        <section key={group} className="team-panel__group">
          <div className="team-panel__group-head">
            <span className="label">{t(`group.${group}` as StringKey)}</span>
            <span className="label">{members.length}</span>
          </div>
          <ul className="team-panel__list">
            {members.map((agent) => {
              const mood = agent.enabled ? moodOf(state.agents[agent.name], now) : 'idle';
              const label = state.agents[agent.name]?.label ?? '';
              const active = mood !== 'idle';
              return (
                <li key={agent.name}>
                  <button
                    type="button"
                    className={`team-row${selected === agent.name ? ' team-row--selected' : ''}${agent.enabled ? '' : ' team-row--disabled'}`}
                    aria-pressed={selected === agent.name}
                    onClick={() => onSelect(selected === agent.name ? undefined : agent.name)}
                  >
                    <span className={moodDot(mood)} />
                    <span className="team-row__body">
                      <span className="team-row__name">{shortName(agent.name)}</span>
                      <span className={`team-row__hint${active ? ' team-row__hint--active' : ''}`}>
                        {active ? `${t(`mood.${mood}` as StringKey)}${label ? ` · ${label}` : ''}` : roleHint(agent.description)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
