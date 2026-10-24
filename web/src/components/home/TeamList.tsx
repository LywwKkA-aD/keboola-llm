import type { AgentInfo } from '../../api/types.ts';
import { type AquariumState, moodOf } from '../../aquarium/state.ts';
import type { StringKey } from '../../i18n/strings.ts';
import { groupTeam } from '../../lib/agent-groups.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { moodDot, roleHint, shortName } from './mood.ts';

/** The team by group with what each agent is doing now; picking one selects it in the aquarium. */
export function TeamList({ agents, state, now, selected, onSelect }: {
  agents: readonly AgentInfo[];
  state: AquariumState;
  now: number;
  selected?: string;
  onSelect: (name: string | undefined) => void;
}) {
  const { t } = useSettings();

  return (
    <div className="team-list">
      {groupTeam(agents).map(({ group, agents: members }) => (
        <section key={group} className="team-list__group">
          <div className="team-list__group-head">
            <span className="label">{t(`group.${group}` as StringKey)}</span>
            <span className="label">{members.length}</span>
          </div>
          <ul className="team-list__list">
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
    </div>
  );
}
