import { type ReactNode, useId, useState } from 'react';
import { useSettings } from '../../state/settings-context.tsx';

/** Same breakpoint as hud.css: on a phone the card would cover the whole scene. */
const PHONE = '(max-width: 640px)';
const onPhone = () => typeof window.matchMedia === 'function' && window.matchMedia(PHONE).matches;

/**
 * A card floating over the aquarium that collapses to its title, so it can stay without hiding the scene.
 * Starts open, or collapsed on a phone.
 */
export function FloatingCard({ title, tone, children }: { title: string; tone: 'primary' | 'warning'; children: ReactNode }) {
  const { t } = useSettings();
  const titleId = useId();
  const bodyId = useId();
  const [open, setOpen] = useState(() => !onPhone());

  return (
    <section className={`hud-surface float-card float-card--${tone}`} aria-labelledby={titleId}>
      <div className="float-card__head">
        <h2 id={titleId} className="float-card__title">
          {title}
        </h2>
        <button type="button" className="btn btn--ghost btn--small" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((value) => !value)}>
          {t(open ? 'home.collapse' : 'home.expand')}
        </button>
      </div>
      <div id={bodyId} className="float-card__body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
