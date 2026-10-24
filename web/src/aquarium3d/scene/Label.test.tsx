import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Label } from './Label.tsx';

// No WebGL here: stand in for the R3F store and for drei Html, which only matter as "mounted or not".
const scene = vi.hoisted(() => ({ events: { connected: undefined as unknown } }));
vi.mock('@react-three/fiber', () => ({
  useThree: <T,>(select: (state: typeof scene) => T) => select(scene),
}));
vi.mock('@react-three/drei', () => ({
  Html: ({ children, center }: { children?: ReactNode; center?: boolean }) => (
    <div data-testid="html" data-center={String(Boolean(center))}>
      {children}
    </div>
  ),
}));

describe('Label', () => {
  beforeEach(() => {
    scene.events.connected = undefined;
  });

  it('stays unmounted until R3F has connected its event target, so drei never re-roots it', () => {
    render(<Label center>LEAD</Label>);
    expect(screen.queryByTestId('html')).toBeNull();
  });

  it('renders drei Html with its props and children once connected', () => {
    scene.events.connected = document.createElement('div');
    render(<Label center>LEAD</Label>);
    expect(screen.getByTestId('html')).toHaveTextContent('LEAD');
    expect(screen.getByTestId('html').dataset.center).toBe('true');
  });
});
