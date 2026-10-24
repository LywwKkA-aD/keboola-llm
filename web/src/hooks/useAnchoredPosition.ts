import { type CSSProperties, type RefObject, useLayoutEffect, useState } from 'react';

const GAP = 4;
const VIEWPORT_MARGIN = 8;
const MAX_HEIGHT = 320;
/** With at least this much room below, a panel that does not fit opens downwards anyway and scrolls. */
const MIN_ROOM_BELOW = 160;

type Anchor = Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>;

/**
 * Fixed-position box for a panel of about `contentHeight` px under its anchor, or over it when it does not
 * fit below and there is more room above.
 */
export function anchoredStyle(anchor: Anchor, viewportHeight: number, contentHeight = MAX_HEIGHT): CSSProperties {
  const below = viewportHeight - anchor.bottom - GAP - VIEWPORT_MARGIN;
  const above = anchor.top - GAP - VIEWPORT_MARGIN;
  const upwards = below < Math.min(contentHeight, MIN_ROOM_BELOW) && above > below;
  const box = { left: anchor.left, width: anchor.width, maxHeight: Math.min(MAX_HEIGHT, upwards ? above : below) };
  return upwards ? { bottom: viewportHeight - anchor.top + GAP, ...box } : { top: anchor.bottom + GAP, ...box };
}

/**
 * Keeps a fixed-position panel attached to its anchor while `active`, following scrolling parents and
 * window resizes. Undefined until measured, so the panel can wait a commit instead of flashing at 0,0.
 */
export function useAnchoredPosition(anchor: RefObject<HTMLElement | null>, active: boolean, contentHeight?: number): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties>();

  useLayoutEffect(() => {
    if (!active) return undefined;
    const place = () => {
      if (anchor.current) setStyle(anchoredStyle(anchor.current.getBoundingClientRect(), window.innerHeight, contentHeight));
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      setStyle(undefined);
    };
  }, [anchor, active, contentHeight]);

  return active ? style : undefined;
}
