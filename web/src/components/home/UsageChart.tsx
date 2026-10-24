import { useState } from 'react';
import type { UsageReport } from '../../api/types.ts';
import { formatTokens } from '../../lib/format.ts';
import { cacheShare, formatShare, scaleMax, shortDate } from '../../lib/usage.ts';
import { useSettings } from '../../state/settings-context.tsx';

const WIDTH = 336;
const HEIGHT = 96;
const TOP = 6;
const BAR = 14;
const GAP = 2;
const RADIUS = 4;

/** A column segment with a rounded top (the data end) and a square foot on the baseline. */
function topRounded(x: number, y: number, width: number, height: number): string {
  const r = Math.min(RADIUS, height, width / 2);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

type Day = UsageReport['days'][number];

/** Prompt tokens of the last 14 days: read from the cache at the foot of each column, the rest above it. */
export function UsageChart({ days }: { days: UsageReport['days'] }) {
  const { t, settings } = useSettings();
  const [focus, setFocus] = useState(days.length - 1);
  const top = scaleMax(Math.max(0, ...days.map((day) => day.input)));
  const slot = WIDTH / Math.max(days.length, 1);
  const y = (tokens: number) => (top > 0 ? ((HEIGHT - TOP) * tokens) / top : 0);
  const shown: Day | undefined = days[focus] ?? days.at(-1);
  const readout = (day: Day) =>
    `${shortDate(day.date, settings.language)}: ${t('usage.input')} ${formatTokens(day.input)} · ${t('usage.fromCache')} ${formatShare(cacheShare(day))} · ${t('usage.output')} ${formatTokens(day.output)}`;

  return (
    <figure className="usage-chart">
      <figcaption className="usage-chart__head">
        <span>{t('usage.byDay')}</span>
        <span className="usage-legend">
          <span className="usage-legend__item">
            <span className="usage-swatch usage-swatch--cached" aria-hidden="true" />
            {t('usage.fromCache')}
          </span>
          <span className="usage-legend__item">
            <span className="usage-swatch usage-swatch--fresh" aria-hidden="true" />
            {t('usage.notCached')}
          </span>
        </span>
      </figcaption>
      <div className="usage-chart__plot">
        <span className="usage-chart__max mono" aria-hidden="true">
          {formatTokens(top)}
        </span>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="usage-chart__svg" role="group" aria-label={t('usage.byDay')} onMouseLeave={() => setFocus(days.length - 1)}>
          <line className="usage-chart__grid" x1={0} x2={WIDTH} y1={TOP + 0.5} y2={TOP + 0.5} />
          <line className="usage-chart__base" x1={0} x2={WIDTH} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} />
          {days.map((day, index) => {
            const x = index * slot + (slot - BAR) / 2;
            const cached = y(day.cached);
            const fresh = y(Math.max(0, day.input - day.cached));
            const freshTop = HEIGHT - cached - fresh - (cached > 0 && fresh > 0 ? GAP : 0);
            return (
              <g
                key={day.date}
                className={`usage-col${index === focus ? ' usage-col--on' : ''}`}
                tabIndex={0}
                role="img"
                aria-label={readout(day)}
                onMouseEnter={() => setFocus(index)}
                onFocus={() => setFocus(index)}
              >
                <rect className="usage-col__hit" x={index * slot} y={0} width={slot} height={HEIGHT} />
                {cached > 0 && <path className="usage-col__cached" d={fresh > 0 ? `M${x},${HEIGHT}V${HEIGHT - cached}H${x + BAR}V${HEIGHT}Z` : topRounded(x, HEIGHT - cached, BAR, cached)} />}
                {fresh > 0 && <path className="usage-col__fresh" d={topRounded(x, freshTop, BAR, fresh)} />}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="usage-chart__axis mono" aria-hidden="true">
        <span>{days[0] ? shortDate(days[0].date, settings.language) : ''}</span>
        <span>{days.at(-1) ? shortDate(days.at(-1)?.date ?? '', settings.language) : ''}</span>
      </div>
      <p className="usage-chart__readout" aria-live="polite">
        {shown ? readout(shown) : ''}
      </p>
    </figure>
  );
}
