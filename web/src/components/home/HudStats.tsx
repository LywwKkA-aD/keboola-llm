import type { Ref } from 'react';
import type { UsageReport } from '../../api/types.ts';
import { formatTokens } from '../../lib/format.ts';
import { cacheShare, formatShare } from '../../lib/usage.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';

function Stat({ value, label, tone }: { value: string | number; label: string; tone?: 'blue' | 'amber' | undefined }) {
  return (
    <span className="hud-stat">
      <span className={`hud-stat__value mono${tone ? ` hud-stat__value--${tone}` : ''}`}>{value}</span>
      <span className="hud-stat__label">{label}</span>
    </span>
  );
}

/** Running chats, pending approvals and today's tokens with the cache share; the tokens open the usage panel. */
export function HudStats({ usage, usageOpen, usagePanelId, usageRef, onUsage }: {
  usage: UsageReport | undefined;
  usageOpen: boolean;
  usagePanelId: string | undefined;
  usageRef: Ref<HTMLButtonElement>;
  onUsage: () => void;
}) {
  const { t } = useSettings();
  const { live, approvals } = useLive();
  const today = usage?.today;

  return (
    <div className="hud-stats">
      <Stat value={live.running.length} label={t('top.runs')} tone={live.running.length ? 'blue' : undefined} />
      <Stat value={approvals.length} label={t('top.waiting')} tone={approvals.length ? 'amber' : undefined} />
      <button
        ref={usageRef}
        type="button"
        className={`hud-usage${usageOpen ? ' hud-usage--on' : ''}`}
        aria-expanded={usageOpen}
        aria-controls={usagePanelId}
        title={t('usage.open')}
        onClick={onUsage}
      >
        <Stat value={formatTokens(today ? today.input + today.output : 0)} label={t('home.tokensToday')} />
        <Stat value={formatShare(today ? cacheShare(today) : undefined)} label={t('home.cache')} />
      </button>
    </div>
  );
}
