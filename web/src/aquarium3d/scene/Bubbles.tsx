import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { type InstancedMesh, Object3D, SphereGeometry, type Vector3 } from 'three';

const PER_AGENT = 8;
const MAX_AGENTS = 12;
const RISE = 2.6;
const bubbleGeometry = new SphereGeometry(0.06, 10, 8);

/** Thin streams of bubbles above every busy octopus; idle water stays calm. */
export function Bubbles({ busy, positions, motion }: { busy: readonly string[]; positions: ReadonlyMap<string, Vector3>; motion: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const seeds = useMemo(() => Array.from({ length: PER_AGENT * MAX_AGENTS }, () => Math.random()), []);

  useFrame(({ clock }) => {
    const instances = mesh.current;
    if (!instances) return;
    const t = motion ? clock.elapsedTime : 0;
    const active = busy.slice(0, MAX_AGENTS);
    for (let i = 0; i < PER_AGENT * MAX_AGENTS; i += 1) {
      const owner = active[Math.floor(i / PER_AGENT)];
      const origin = owner ? positions.get(owner) : undefined;
      const seed = seeds[i] ?? 0;
      if (!origin) {
        dummy.scale.setScalar(0);
      } else {
        const life = (t * (0.35 + seed * 0.25) + seed) % 1;
        dummy.position.set(
          origin.x + Math.sin(t * 2 + seed * 20) * 0.12 + (seed - 0.5) * 0.3,
          origin.y + 1.1 + life * RISE,
          origin.z + Math.cos(t * 1.7 + seed * 13) * 0.12,
        );
        dummy.scale.setScalar((0.5 + seed) * (1 - life * 0.6));
      }
      dummy.updateMatrix();
      instances.setMatrixAt(i, dummy.matrix);
    }
    instances.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[bubbleGeometry, undefined, PER_AGENT * MAX_AGENTS]} frustumCulled={false}>
      <meshStandardMaterial color="#bfe6ff" emissive="#3dd6f5" emissiveIntensity={0.6} transparent opacity={0.45} roughness={0.1} />
    </instancedMesh>
  );
}
