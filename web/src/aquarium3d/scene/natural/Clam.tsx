import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { DoubleSide, type Group, MathUtils, type MeshStandardMaterial, SphereGeometry } from 'three';
import { GLOW } from './materials.ts';

/** Half of a ribbed shell: a squashed hemisphere with radial ribs pressed into it. */
function shellGeometry(): SphereGeometry {
  const geometry = new SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const rib = 1 + 0.05 * Math.sin(Math.atan2(z, x) * 18);
    position.setXYZ(i, x * rib, position.getY(i), z * rib);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A giant clam with a glowing pearl: it opens wider and the pearl brightens while an agent builds or writes. */
export function Clam({ active, motion }: { active: boolean; motion: boolean }) {
  const shell = useMemo(() => shellGeometry(), []);
  const lid = useRef<Group>(null);
  const pearl = useRef<MeshStandardMaterial>(null);

  useFrame(({ clock }, delta) => {
    const t = motion ? clock.elapsedTime : 0;
    if (lid.current) {
      const target = (active ? 1.05 : 0.62) + Math.sin(t * 0.8) * (motion ? 0.04 : 0);
      lid.current.rotation.x = MathUtils.damp(lid.current.rotation.x, -target, 2.5, Math.min(delta, 0.05));
    }
    if (pearl.current) pearl.current.emissiveIntensity = active ? 2.2 + 0.6 * Math.sin(t * 3) : 0.5;
  });

  return (
    <group scale={0.78}>
      <mesh geometry={shell} scale={[1.5, -0.45, 1.15]} position={[0, 0.42, 0]}>
        <meshStandardMaterial color="#2a4a5e" roughness={0.55} metalness={0.15} side={DoubleSide} />
      </mesh>
      {/* Hinge at the back: the lid rotates around it. */}
      <group ref={lid} position={[0, 0.42, -1.12]}>
        <mesh geometry={shell} scale={[1.5, 0.45, 1.15]} position={[0, 0, 1.12]}>
          <meshStandardMaterial color="#2f566c" roughness={0.5} metalness={0.15} side={DoubleSide} />
        </mesh>
      </group>
      <mesh position={[0, 0.5, 0.15]}>
        <sphereGeometry args={[0.3, 32, 24]} />
        <meshStandardMaterial ref={pearl} color={GLOW.pearl} emissive={active ? GLOW.green : GLOW.pearl} roughness={0.15} toneMapped={false} />
      </mesh>
    </group>
  );
}
