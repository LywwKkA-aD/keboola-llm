import { type ReactNode, useId, useLayoutEffect, useRef } from 'react';
import { useSettings } from '../../state/settings-context.tsx';

/**
 * A floating panel of the home HUD: a non-modal dialog under its button, so the aquarium stays usable.
 * Takes focus when it opens; when it closes with focus inside, `onReturnFocus` puts it back on the button.
 */
export function HudPanel({ id, title, onClose, onReturnFocus, footer, children }: {
  id: string;
  title: string;
  onClose: () => void;
  onReturnFocus: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useSettings();
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  // Layout effect: its cleanup runs before the panel leaves the DOM, while focus can still be inside.
  const returnFocus = useRef(onReturnFocus);
  useLayoutEffect(() => {
    returnFocus.current = onReturnFocus;
  });
  useLayoutEffect(() => {
    const node = panel.current;
    node?.focus();
    return () => {
      if (node?.contains(document.activeElement)) returnFocus.current();
    };
  }, []);

  return (
    <section ref={panel} id={id} className="hud-surface hud-panel" role="dialog" aria-labelledby={titleId} tabIndex={-1}>
      <header className="hud-panel__head">
        <h2 id={titleId} className="hud-panel__title">
          {title}
        </h2>
        <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
          {t('home.close')}
        </button>
      </header>
      <div className="hud-panel__body">{children}</div>
      {footer && <footer className="hud-panel__foot">{footer}</footer>}
    </section>
  );
}
