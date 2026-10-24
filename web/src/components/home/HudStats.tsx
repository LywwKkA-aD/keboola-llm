import { formatTokens } from '../../lib/format.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';

function Stat({ value, label, tone, title }: { value: string | number; label: string; tone?: 'blue' | 'amber' | undefined; title?: string }) {
  return (
    <div className="hud-stat" title={title}>
      <span className={`hud-stat__value mono${tone ? ` hud-stat__value--${tone}` : ''}`}>{value}</span>
      <span className="hud-stat__label">{label}</span>
    </div>
  );
}

/** Running chats, pending approvals and the tokens of this session, compact for the HUD bar. */
export function HudStats() {
  const { t } = useSettings();
  const { live, approvals } = useLive();
  const { input, cached, output } = live.usage;
  const usage = [
    t('home.usage'),
    `${t('home.input')} ${formatTokens(input)}`,
    `${t('home.cached')} ${formatTokens(cached)}`,
    `${t('home.output')} ${formatTokens(output)}`,
  ].join(' · ');

  return (
    <div className="hud-stats">
      <Stat value={live.running.length} label={t('top.runs')} tone={live.running.length ? 'blue' : undefined} />
      <Stat value={approvals.length} label={t('top.waiting')} tone={approvals.length ? 'amber' : undefined} />
      <Stat value={formatTokens(input + output)} label={t('home.tokens')} title={usage} />
    </div>
  );
}
