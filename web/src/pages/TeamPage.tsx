import type { AgentInfo } from '../api/types.ts';
import { AgentAvatar } from '../components/AgentAvatar.tsx';
import { useSettings } from '../state/settings-context.tsx';
import { useTeam } from '../state/team-context.tsx';

function AgentCard({ agent }: { agent: AgentInfo }) {
  const { t } = useSettings();
  return (
    <article className={`agent-card${agent.enabled ? '' : ' agent-card--disabled'}`}>
      <header className="agent-card__header">
        <AgentAvatar name={agent.name} color={agent.avatar?.color ?? '#8C96A3'} size={36} />
        <div>
          <h3 className="agent-card__name">{agent.name}</h3>
          <div className="agent-card__badges">
            {agent.role === 'orchestrator' && <span className="badge badge--blue">{t('team.lead')}</span>}
            {!agent.enabled && <span className="badge">{t('team.disabled')}</span>}
            {agent.access && <span className="badge badge--green">{t(agent.access === 'write' ? 'team.access.write' : 'team.access.read')}</span>}
          </div>
        </div>
      </header>
      <p className="agent-card__description">{agent.description}</p>
      {agent.skills.length > 0 && (
        <div className="agent-card__meta">
          {t('team.skills')}: {agent.skills.join(', ')}
        </div>
      )}
      {agent.tools.length > 0 && (
        <div className="agent-card__meta">
          {t('team.tools')}: {agent.tools.join(', ')}
        </div>
      )}
      {agent.basedOn && (
        <div className="agent-card__meta agent-card__meta--muted">
          {t('team.basedOn')}: {agent.basedOn}
        </div>
      )}
    </article>
  );
}

export function TeamPage() {
  const { t } = useSettings();
  const team = useTeam();
  const ordered = team.agents.toSorted((a, b) => Number(b.role === 'orchestrator') - Number(a.role === 'orchestrator') || Number(b.enabled) - Number(a.enabled));
  return (
    <div className="page">
      <h1 className="page__title">{t('team.title')}</h1>
      {team.warnings.length + team.loadErrors.length > 0 && (
        <div className="notice">
          <strong>{t('team.warnings')}:</strong>
          <ul>
            {team.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
            {team.loadErrors.map((error) => (
              <li key={`${error.file}${error.message}`}>{error.message}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="agent-grid">
        {ordered.map((agent) => (
          <AgentCard key={agent.name} agent={agent} />
        ))}
      </div>
    </div>
  );
}
