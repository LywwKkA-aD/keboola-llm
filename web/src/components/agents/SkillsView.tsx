import { useState } from 'react';
import type { TeamInfo } from '../../api/types.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { useTeam } from '../../state/team-context.tsx';
import { roleHint } from '../home/mood.ts';
import { VersionHistory } from '../versions/VersionHistory.tsx';
import { Drawer, DrawerHead } from './Drawer.tsx';
import { RemovedDefinitions } from './RemovedDefinitions.tsx';

type Skill = TeamInfo['skills'][number];

/** The app's own skills live in skills/<name>/ and are the only ones with a history. */
const CUSTOM = 'custom';

function SkillDetail({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const { t } = useSettings();
  const custom = skill.source === CUSTOM;
  return (
    <>
      <DrawerHead label={t('skills.name')} title={skill.name} onClose={onClose}>
        <span className={custom ? 'chip chip--blue' : 'chip mono'}>{custom ? t('skills.custom') : skill.source}</span>
      </DrawerHead>
      <div className="panel-section">
        <span className="label">{t('agents.description')}</span>
        <p className="agent-detail__description">{skill.description || t('agents.none')}</p>
        {!custom && <p className="skills__note">{t('skills.vendored')}</p>}
      </div>
      {custom && <VersionHistory kind="skills" name={skill.name} />}
    </>
  );
}

/** Skills tab of the Agents page: every skill agents can read, the app's own first. */
export function SkillsView() {
  const { t } = useSettings();
  const team = useTeam();
  const [selected, setSelected] = useState<string>();
  const rows = team.skills.toSorted(
    (a, b) => Number(b.source === CUSTOM) - Number(a.source === CUSTOM) || a.source.localeCompare(b.source) || a.name.localeCompare(b.name),
  );
  const skill = team.skills.find((entry) => entry.name === selected);
  const custom = team.skills.filter((entry) => entry.source === CUSTOM).map((entry) => entry.name);

  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th className="label">{t('skills.name')}</th>
            <th className="label">{t('skills.source')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="table__row" onClick={() => setSelected(row.name)}>
              <td>
                <button type="button" className="table__name" onClick={() => setSelected(row.name)}>
                  <span>
                    {row.name}
                    <span className="table__hint">{roleHint(row.description, 110)}</span>
                  </span>
                </button>
              </td>
              <td>{row.source === CUSTOM ? <span className="chip chip--blue">{t('skills.custom')}</span> : <span className="mono table__small">{row.source}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty skills__empty">{t('skills.none')}</p>}
      <RemovedDefinitions kind="skills" present={custom} />
      {skill && (
        <Drawer label={skill.name} onClose={() => setSelected(undefined)}>
          <SkillDetail skill={skill} onClose={() => setSelected(undefined)} />
        </Drawer>
      )}
    </>
  );
}
