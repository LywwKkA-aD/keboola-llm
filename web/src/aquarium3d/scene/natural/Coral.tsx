import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, CylinderGeometry, type InstancedMesh, Matrix4, Quaternion, SphereGeometry, Vector3 } from 'three';
import { coralBranches } from '../../nature.ts';
import { GLOW } from './materials.ts';

const branchGeometry = new CylinderGeometry(0.7, 1, 1, 7, 1);
const polypGeometry = new SphereGeometry(1, 10, 8);
const UP = new Vector3(0, 1, 0);

/** Branching "memory coral" with glowing polyps; a wave of light runs through them while an agent reads. */
export function Coral({ seed, scale, active, motion }: { seed: number; scale: number; active: boolean; motion: boolean }) {
  const branchesRef = useRef<InstancedMesh>(null);
  const polypsRef = useRef<InstancedMesh>(null);
  const branches = useMemo(() => coralBranches(seed, 4), [seed]);
  const tips = useMemo(() => branches.filter((branch) => branch.tip), [branches]);
  const color = useMemo(() => new Color(), []);

  useEffect(() => {
    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    branches.forEach((branch, i) => {
      const start = new Vector3(...branch.start);
      const end = new Vector3(...branch.end);
      const direction = end.clone().sub(start);
      const length = direction.length();
      quaternion.setFromUnitVectors(UP, direction.normalize());
      matrix.compose(start.clone().add(end).multiplyScalar(0.5), quaternion, new Vector3(branch.radius, length, branch.radius));
      branchesRef.current?.setMatrixAt(i, matrix);
    });
    tips.forEach((tip, i) => {
      const size = tip.radius * 1.9;
      matrix.compose(new Vector3(...tip.end), quaternion.identity(), new Vector3(size, size, size));
      polypsRef.current?.setMatrixAt(i, matrix);
      polypsRef.current?.setColorAt(i, GLOW.cyan);
    });
    if (branchesRef.current) branchesRef.current.instanceMatrix.needsUpdate = true;
    if (polypsRef.current) polypsRef.current.instanceMatrix.needsUpdate = true;
  }, [branches, tips]);

  useFrame(({ clock }) => {
    const polyps = polypsRef.current;
    if (!polyps) return;
    const t = motion ? clock.elapsedTime : 0;
    tips.forEach((tip, i) => {
      const height = tip.end[1];
      const glow = active ? 0.7 + 0.9 * Math.max(0, Math.sin(t * 3 - height * 2.5)) : 0.3 + 0.12 * Math.sin(t * 0.7 + i);
      polyps.setColorAt(i, color.copy(GLOW.cyan).multiplyScalar(glow));
    });
    if (polyps.instanceColor) polyps.instanceColor.needsUpdate = true;
  });

  return (
    <group scale={scale}>
      <instancedMesh ref={branchesRef} args={[branchGeometry, undefined, branches.length]}>
        <meshStandardMaterial color="#173c52" roughness={0.75} emissive="#0b2a3d" emissiveIntensity={0.4} />
      </instancedMesh>
      <instancedMesh ref={polypsRef} args={[polypGeometry, undefined, tips.length]}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
