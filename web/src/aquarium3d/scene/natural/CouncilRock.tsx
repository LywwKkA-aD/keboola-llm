import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CapsuleGeometry, Color, type InstancedMesh, Object3D, SphereGeometry } from 'three';
import { seeded } from '../../nature.ts';
import { GLOW, STONE } from './materials.ts';
import { rockGeometry } from './rockGeometry.ts';

const ANEMONES = 14;
const TENTACLES = 7;
const RIM = 2.05;
const stalk = new CapsuleGeometry(0.035, 0.32, 4, 6);
const tipGeometry = new SphereGeometry(0.05, 8, 6);

/** The lead's flat rock, ringed by small anemones whose tips glow brighter while the lead works. */
export function CouncilRock({ active, motion }: { active: boolean; motion: boolean }) {
  const stalks = useRef<InstancedMesh>(null);
  const tips = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const layout = useMemo(() => {
    const random = seeded(19);
    return Array.from({ length: ANEMONES * TENTACLES }, (_, i) => {
      const anemone = Math.floor(i / TENTACLES);
      const angle = (anemone / ANEMONES) * Math.PI * 2 + random() * 0.15;
      const fan = ((i % TENTACLES) / TENTACLES) * Math.PI * 2;
      return { angle, fan, lean: 0.35 + random() * 0.3, phase: random() * Math.PI * 2 };
    });
  }, []);

  useEffect(() => {
    // Base colour per instance must exist before setColorAt in the frame loop.
    layout.forEach((_, i) => tips.current?.setColorAt(i, GLOW.cyan));
  }, [layout]);

  useFrame(({ clock }) => {
    const t = motion ? clock.elapsedTime : 0;
    layout.forEach(({ angle, fan, lean, phase }, i) => {
      const sway = Math.sin(t * 1.3 + phase) * 0.18;
      const base: [number, number, number] = [Math.cos(angle) * RIM, 0.62, Math.sin(angle) * RIM];
      dummy.position.set(...base);
      dummy.rotation.set(Math.cos(fan) * (lean + sway), 0, Math.sin(fan) * (lean + sway));
      dummy.updateMatrix();
      stalks.current?.setMatrixAt(i, dummy.matrix);
      dummy.translateY(0.22);
      dummy.updateMatrix();
      tips.current?.setMatrixAt(i, dummy.matrix);
      const glow = active ? 0.9 + 0.6 * Math.sin(t * 3 + angle * 2) : 0.35 + 0.1 * Math.sin(t + phase);
      tips.current?.setColorAt(i, color.copy(GLOW.cyan).multiplyScalar(glow));
    });
    if (stalks.current) stalks.current.instanceMatrix.needsUpdate = true;
    if (tips.current) {
      tips.current.instanceMatrix.needsUpdate = true;
      if (tips.current.instanceColor) tips.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <mesh geometry={rockGeometry(4, 4, 0.55)} material={STONE} scale={[2.35, 0.75, 2.2]} position={[0, 0.1, 0]} />
      <instancedMesh ref={stalks} args={[stalk, undefined, ANEMONES * TENTACLES]}>
        <meshStandardMaterial color="#1f4a5c" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={tips} args={[tipGeometry, undefined, ANEMONES * TENTACLES]}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
