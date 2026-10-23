import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CatmullRomCurve3, type Group, type MeshStandardMaterial, TubeGeometry, Vector3 } from 'three';
import { GLOW, STONE } from './materials.ts';
import { rockGeometry } from './rockGeometry.ts';

const STALK = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(0.1, 1.2, 0), new Vector3(-0.15, 2.2, 0.2), new Vector3(0.25, 2.9, 0.55)]);
const TIP = STALK.getPoint(1);

/** A lure-like lantern plant: its bulb glows amber and pulses while someone waits for the user's approval. */
export function Lantern({ active, motion }: { active: boolean; motion: boolean }) {
  const stalk = useMemo(() => new TubeGeometry(STALK, 48, 0.06, 8, false), []);
  const sway = useRef<Group>(null);
  const bulb = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const t = motion ? clock.elapsedTime : 0;
    if (sway.current) sway.current.rotation.z = Math.sin(t * 0.7) * 0.06;
    if (bulb.current) bulb.current.emissiveIntensity = active ? 2.4 + 1.4 * Math.sin(t * 4.5) : 0.25;
  });

  return (
    <group>
      <mesh geometry={rockGeometry(31, 2)} material={STONE} scale={[0.7, 0.35, 0.6]} />
      <group ref={sway}>
        <mesh geometry={stalk}>
          <meshStandardMaterial color="#244a3c" roughness={0.7} />
        </mesh>
        <mesh position={TIP}>
          <sphereGeometry args={[0.2, 24, 16]} />
          <meshStandardMaterial ref={bulb} color="#ffe2a8" emissive={GLOW.amber} toneMapped={false} />
        </mesh>
        {active && <pointLight position={TIP} color={GLOW.amber} intensity={5} distance={6} />}
      </group>
    </group>
  );
}
