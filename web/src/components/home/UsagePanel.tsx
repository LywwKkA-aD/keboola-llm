import { useState } from 'react';
import type { UsageReport, UsageTotals } from '../../api/types.ts';
import { formatTokens } from '../../lib/format.ts';
import { cacheShare, formatShare } from '../../lib/usage.ts';
import type { StringKey } from '../../i18n/strings.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { UsageChart } from './UsageChart.tsx';

type Period = 'today' | 'week' | 'total';

const PERIODS: Readonly<Record<Period, StringKey>> = { today: 'usage.today', week: 'usage.week', total: 'usage.total' };

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="usage-tile">
      <span className="usage-tile__label">{label}</span>
      <span className="usage-tile__value mono">{value}</span>
      {note && <span className="usage-tile__note">{note}</span>}
    </div>
  );
}

function Tiles({ totals }: { totals: UsageTotals }) {
  const { t } = useSettings();
  return (
    <div className="usage-tiles">
      <Tile label={t('usage.input')} value={formatTokens(totals.input)} note={`${totals.calls} ${t('usage.calls')}`} />
      <Tile label={t('usage.fromCache')} value={formatShare(cacheShare(totals))} note={formatTokens(totals.cached)} />
      <Tile label={t('usage.cacheWrite')} value={formatTokens(totals.cacheWrite)} />
      <Tile label={t('usage.output')} value={formatTokens(totals.output)} />
    </div>
  );
}

/** Tokens today, this week and in all, how much of the prompts came from the cache, and who used them today. */
export function UsagePanel({ report }: { report: UsageReport | undefined }) {
  const { t } = useSettings();
  const [period, setPeriod] = useState<Period>('today');
  if (!report) return <p className="muted">{t('usage.loading')}</p>;

  return (
    <div className="usage">
      <div className="segmented usage__periods" role="group" aria-label={t('usage.period')}>
        {(Object.keys(PERIODS) as Period[]).map((value) => (
          <button
            key={value}
            type="button"
            className={`segmented__item${period === value ? ' segmented__item--on' : ''}`}
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
          >
            {t(PERIODS[value])}
          </button>
        ))}
      </div>
      <Tiles totals={report[period]} />
      {period === 'total' && report.since && <p className="usage__since muted">{`${t('usage.since')} ${report.since}`}</p>}
      <UsageChart days={report.days} />
      <h3 className="usage__heading">{t('usage.agentsToday')}</h3>
      {report.agents.length === 0 ? (
        <p className="muted">{t('usage.none')}</p>
      ) : (
        <ul className="usage-agents">
          {report.agents.map((entry) => (
            <li key={entry.agent} className="usage-agents__row">
              <span className="usage-agents__name">{entry.agent}</span>
              <span className="mono">{formatTokens(entry.input + entry.output)}</span>
              <span className="usage-agents__cache mono" title={t('usage.fromCache')}>
                {formatShare(cacheShare(entry))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="usage__note muted">{t('usage.note')}</p>
    </div>
  );
}
