import { CameraControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Vector3 } from 'three';

export const OVERVIEW = { position: [0, 8.2, 17.5] as const, target: [0, 0.4, 0.2] as const };
const AUTO_ORBIT_RAD_PER_S = 0.035;
const IDLE_BEFORE_ORBIT_MS = 15_000;

/** Orbit camera: overview by default, flies to the selected octopus, drifts slowly when untouched. */
export function CameraRig({ selected, positions, motion }: {
  selected?: string;
  positions: ReadonlyMap<string, Vector3>;
  motion: boolean;
}) {
  const controls = useRef<CameraControls>(null);
  const lastTouch = useRef(Date.now());

  useEffect(() => {
    const rig = controls.current;
    if (!rig) return;
    const position = selected ? positions.get(selected) : undefined;
    if (position) {
      void rig.setLookAt(position.x * 0.8, position.y + 3.2, position.z + 7.5, position.x, position.y + 0.8, position.z, motion);
    } else {
      void rig.setLookAt(...OVERVIEW.position, ...OVERVIEW.target, motion);
    }
  }, [selected, positions, motion]);

  useFrame((_, delta) => {
    const rig = controls.current;
    if (!rig || !motion || selected) return;
    if (Date.now() - lastTouch.current > IDLE_BEFORE_ORBIT_MS) rig.azimuthAngle += AUTO_ORBIT_RAD_PER_S * delta;
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={5}
      maxDistance={34}
      minPolarAngle={0.25}
      maxPolarAngle={1.42}
      smoothTime={0.6}
      onStart={() => {
        lastTouch.current = Date.now();
      }}
      onEnd={() => {
        lastTouch.current = Date.now();
      }}
    />
  );
}
