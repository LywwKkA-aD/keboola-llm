import { useState } from 'react';
import type { AgentInfo } from '../api/types.ts';
import { moodOf } from '../aquarium/state.ts';
import { AgentDetail } from '../components/home/AgentDetail.tsx';
import { moodDot, roleHint } from '../components/home/mood.ts';
import { Select } from '../components/Select.tsx';
import type { StringKey } from '../i18n/strings.ts';
import { type AgentGroup, GROUP_ORDER, groupOf } from '../lib/agent-groups.ts';
import { useLive } from '../live/live-context.tsx';
import { useSettings } from '../state/settings-context.tsx';
import { useTeam } from '../state/team-context.tsx';

type StatusFilter = 'all' | 'enabled' | 'disabled';
type GroupFilter = AgentGroup | 'all';

const STATUS_FILTERS: readonly [StatusFilter, StringKey][] = [
  ['all', 'agents.all'],
  ['enabled', 'agents.enabled'],
  ['disabled', 'agents.disabled'],
];

const matches = (agent: AgentInfo, status: StatusFilter, group: GroupFilter) =>
  (status === 'all' || (status === 'enabled') === agent.enabled) && (group === 'all' || groupOf(agent) === group);

export function AgentsPage() {
  const { t } = useSettings();
  const team = useTeam();
  const { state, now } = useLive();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [group, setGroup] = useState<GroupFilter>('all');
  const [selected, setSelected] = useState<string>();

  const order = (agent: AgentInfo) => GROUP_ORDER.indexOf(groupOf(agent));
  const rows = team.agents
    .filter((agent) => matches(agent, status, group))
    .toSorted((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
  const agent = team.agents.find((entry) => entry.name === selected);
  const enabled = team.agents.filter((entry) => entry.enabled).length;

  return (
    <div className="page">
      <header className="page__head">
        <span className="label">{t('agents.label')}</span>
        <h1 className="page__title">
          {t('agents.title')} <span className="muted">
            {enabled} / {team.agents.length}
          </span>
        </h1>
      </header>

      <div className="filters">
        <div className="segmented" role="group" aria-label={t('agents.status')}>
          {STATUS_FILTERS.map(([value, key]) => (
            <button key={value} type="button" className={`segmented__item${status === value ? ' segmented__item--on' : ''}`} aria-pressed={status === value} onClick={() => setStatus(value)}>
              {t(key)}
            </button>
          ))}
        </div>
        <Select<GroupFilter>
          className="filters__group"
          aria-label={t('agents.group')}
          value={group}
          options={[['all', t('agents.allGroups')], ...GROUP_ORDER.map((value) => [value, t(`group.${value}` as StringKey)] as const)]}
          onChange={setGroup}
        />
      </div>

      {team.warnings.length + team.loadErrors.length > 0 && (
        <div className="notice">
          <span className="label">{t('agents.warnings')}</span>
          <ul>
            {[...team.warnings, ...team.loadErrors.map((error) => error.message)].map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th className="label">{t('agents.name')}</th>
            <th className="label">{t('agents.group')}</th>
            <th className="label">{t('agents.access')}</th>
            <th className="label">{t('agents.skills')}</th>
            <th className="label">{t('agents.tools')}</th>
            <th className="label">{t('agents.status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const mood = row.enabled ? moodOf(state.agents[row.name], now) : 'idle';
            return (
              <tr key={row.name} className={`table__row${row.enabled ? '' : ' table__row--muted'}`} onClick={() => setSelected(row.name)}>
                <td>
                  <button type="button" className="table__name" onClick={() => setSelected(row.name)}>
                    <span className={moodDot(mood)} />
                    <span>
                      {row.name}
                      <span className="table__hint">{roleHint(row.description, 70)}</span>
                    </span>
                  </button>
                </td>
                <td className="muted">{t(`group.${groupOf(row)}` as StringKey)}</td>
                <td>{row.access ? <span className={`chip${row.access === 'write' ? ' chip--amber' : ' chip--blue'}`}>{t(`access.${row.access}` as StringKey)}</span> : <span className="muted">-</span>}</td>
                <td className="mono table__small">{row.skills.join(', ') || '-'}</td>
                <td className="mono table__small">{row.tools.join(', ') || '-'}</td>
                <td>
                  <span className={`chip${row.enabled ? ' chip--green' : ''}`}>{t(row.enabled ? 'agents.enabled' : 'agents.disabled')}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {agent && (
        <>
          <div className="drawer-scrim" onClick={() => setSelected(undefined)} aria-hidden="true" />
          <aside className="drawer" aria-label={agent.name}>
            <AgentDetail agent={agent} current={state.agents[agent.name]} now={now} onClose={() => setSelected(undefined)} />
          </aside>
        </>
      )}
    </div>
  );
}
