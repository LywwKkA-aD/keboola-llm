import { useEffect, useEffectEvent } from 'react';

/**
 * Calls `onEscape` when Escape is pressed anywhere on the page while `active`. Dialogs that handle Escape
 * themselves (ConfirmDialog) stop the event, so it never closes two layers at once.
 */
export function useEscape(onEscape: () => void, active: boolean): void {
  const handle = useEffectEvent(onEscape);
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) handle();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active]);
}
