import { CameraControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Vector3 } from 'three';
import { overviewPose } from '../camera.ts';

export { OVERVIEW } from '../camera.ts';

/** Orbit camera: an overview that fits the viewport and flies to the selected octopus. It never moves on its own. */
export function CameraRig({ selected, positions, motion }: {
  selected?: string;
  positions: ReadonlyMap<string, Vector3>;
  motion: boolean;
}) {
  const controls = useRef<CameraControls>(null);
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height));

  useEffect(() => {
    const rig = controls.current;
    if (!rig) return;
    const position = selected ? positions.get(selected) : undefined;
    if (position) {
      void rig.setLookAt(position.x * 0.8, position.y + 3.2, position.z + 7.5, position.x, position.y + 0.8, position.z, motion);
    } else {
      const { position: eye, target } = overviewPose(aspect);
      void rig.setLookAt(...eye, ...target, motion);
    }
  }, [selected, positions, motion, aspect]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={5}
      maxDistance={40}
      minPolarAngle={0.25}
      maxPolarAngle={1.42}
      smoothTime={0.6}
    />
  );
}
