import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { ComponentProps } from 'react';

/**
 * drei Html that mounts only after R3F has connected its event target. Html puts its element into
 * events.connected (the canvas parent until then) and builds a new React root on the same element
 * when that target changes. R3F connects right after the first commit, so every label was re-rooted
 * at start; under React 19 the first root then unmounts late and throws "removeChild: not a child
 * of this node" when the user leaves the page. Waiting for the connection keeps the target fixed.
 */
export function Label(props: ComponentProps<typeof Html>) {
  const connected = useThree((state) => Boolean(state.events.connected));
  return connected ? <Html {...props} /> : null;
}
