import type { ReactNode } from 'react';
import { useSettings } from '../../state/settings-context.tsx';

/** The right-hand drawer of the Agents page, over a scrim that closes it. */
export function Drawer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" aria-label={label}>
        {children}
      </aside>
    </>
  );
}

/** Kind label, close button and title at the top of a drawer. */
export function DrawerHead({ label, title, onClose, children }: { label: string; title: string; onClose: () => void; children?: ReactNode }) {
  const { t } = useSettings();
  return (
    <div className="panel-section">
      <div className="panel-section__head">
        <span className="label">{label}</span>
        <button type="button" className="btn btn--ghost btn--small" onClick={onClose} aria-label={t('home.close')}>
          {t('home.close')}
        </button>
      </div>
      <h2 className="agent-detail__name">{title}</h2>
      {children}
    </div>
  );
}
