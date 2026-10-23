import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { ConeGeometry, CylinderGeometry, type MeshPhysicalMaterial, Quaternion, Vector3 } from 'three';
import { crystalCluster } from '../../nature.ts';
import { GLOW, STONE } from './materials.ts';
import { rockGeometry } from './rockGeometry.ts';

const prism = new CylinderGeometry(1, 1, 1, 6, 1);
const point = new ConeGeometry(1, 1, 6, 1);
const UP = new Vector3(0, 1, 0);

/** A druse of data crystals growing from a rock: they glow from inside, and pulse while an agent works in Keboola. */
export function Crystals({ active, motion }: { active: boolean; motion: boolean }) {
  const crystals = useMemo(() => crystalCluster(5, 11), []);
  const materials = useRef<(MeshPhysicalMaterial | null)[]>([]);

  useFrame(({ clock }) => {
    const t = motion ? clock.elapsedTime : 0;
    crystals.forEach((crystal, i) => {
      const material = materials.current[i];
      if (!material) return;
      material.emissiveIntensity = active ? 1.1 + 0.9 * Math.max(0, Math.sin(t * 2.4 + crystal.phase)) : 0.35 + 0.08 * Math.sin(t * 0.6 + crystal.phase);
    });
  });

  return (
    <group>
      <mesh geometry={rockGeometry(9, 3)} material={STONE} scale={[1.6, 0.7, 1.4]} position={[0, 0.05, 0]} />
      {crystals.map((crystal, i) => {
        const rotation = new Quaternion().setFromUnitVectors(UP, new Vector3(...crystal.direction));
        const body = crystal.length * 0.82;
        return (
          <group key={i} position={[crystal.offset[0] * 3, 0.35, crystal.offset[2] * 3]} quaternion={rotation}>
            <mesh geometry={prism} position={[0, body / 2, 0]} scale={[crystal.radius, body, crystal.radius]}>
              <meshPhysicalMaterial
                ref={(material) => {
                  materials.current[i] = material;
                }}
                color="#5aa8ff"
                emissive={GLOW.blue}
                roughness={0.12}
                metalness={0.05}
                clearcoat={1}
                transparent
                opacity={0.88}
              />
            </mesh>
            <mesh geometry={point} position={[0, body + crystal.length * 0.09, 0]} scale={[crystal.radius, crystal.length * 0.18, crystal.radius]}>
              <meshPhysicalMaterial color="#8cc8ff" emissive={GLOW.cyan} emissiveIntensity={active ? 1.4 : 0.5} roughness={0.1} clearcoat={1} transparent opacity={0.9} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
