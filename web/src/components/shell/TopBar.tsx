import { NavLink } from 'react-router';
import type { StringKey } from '../../i18n/strings.ts';
import { formatClock } from '../../lib/format.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import { Glyph } from './Glyph.tsx';

const NAV: readonly (readonly [string, StringKey, boolean])[] = [
  ['/', 'nav.home', true],
  ['/chat', 'nav.chats', false],
  ['/agents', 'nav.agents', false],
  ['/approvals', 'nav.approvals', false],
  ['/settings', 'nav.settings', false],
];

function StatusItem({ label, value }: { label: StringKey; value: string }) {
  const { t } = useSettings();
  return (
    <div className="topbar__status-item">
      <span className="label">{t(label)}</span>
      <span className="topbar__status-value mono">{value || t('top.unset')}</span>
    </div>
  );
}

export function TopBar() {
  const { t, settings } = useSettings();
  const { connected, approvals, status, now, live } = useLive();
  const running = Math.max(status?.activeRuns ?? 0, live.running.length);

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <Glyph />
        <span className="topbar__name">{t('app.title')}</span>
        <span className="topbar__sub label">{t('app.subtitle')}</span>
      </div>
      <nav className="topbar__nav" aria-label={t('app.title')}>
        {NAV.map(([to, key, end]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `topbar__link${isActive ? ' topbar__link--active' : ''}`}>
            {t(key)}
            {to === '/approvals' && approvals.length > 0 && <span className="topbar__badge">{approvals.length}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="topbar__status">
        <span className={`topbar__live${connected ? ' topbar__live--on' : ''}`}>
          <span className={`dot ${connected ? 'dot--blue dot--pulse' : 'dot--red'}`} />
          {t(connected ? 'top.live' : 'top.offline')}
        </span>
        <StatusItem label="top.project" value={status?.keboolaProject ?? ''} />
        <StatusItem label="top.model" value={status?.model ?? ''} />
        <div className="topbar__status-item">
          <span className="label">{t('top.runs')}</span>
          <span className={`topbar__status-value mono${running > 0 ? ' topbar__status-value--active' : ''}`}>{running}</span>
        </div>
        <time className="topbar__clock mono">{formatClock(now || Date.now(), settings.language)}</time>
      </div>
    </header>
  );
}
