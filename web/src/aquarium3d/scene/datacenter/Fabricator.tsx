import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Color, type Group, type Mesh, type MeshBasicMaterial, type MeshPhysicalMaterial } from 'three';

const METAL = { color: '#0d1520', metalness: 0.75, roughness: 0.35 } as const;
const BLUE = new Color('#228dff');
const GREEN = new Color('#2bd47d');
const BUILD_SECONDS = 4;
const MODULE_HEIGHT = 1.1;

/**
 * Build station: a holographic fabricator. While an agent writes an agent or skill, a ring gantry
 * sweeps up and down, a beam shines from above and a glowing hexagonal module is printed layer by layer.
 */
export function Fabricator({ active, motion }: { active: boolean; motion: boolean }) {
  const gantry = useRef<Group>(null);
  const module = useRef<Mesh>(null);
  const moduleMaterial = useRef<MeshPhysicalMaterial>(null);
  const beam = useRef<Mesh>(null);
  const ring = useRef<MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const t = motion ? clock.elapsedTime : 0;
    const progress = active ? (t % BUILD_SECONDS) / BUILD_SECONDS : 1;
    const height = Math.max(0.04, progress) * MODULE_HEIGHT;
    if (module.current) {
      module.current.scale.y = height / MODULE_HEIGHT;
      module.current.position.y = 0.32 + height / 2;
    }
    if (moduleMaterial.current) {
      moduleMaterial.current.emissive.copy(active ? GREEN : BLUE);
      moduleMaterial.current.emissiveIntensity = active ? 0.9 : 0.35;
    }
    if (gantry.current) {
      gantry.current.position.y = active ? 0.32 + height : 0.32 + MODULE_HEIGHT + 0.25;
      gantry.current.rotation.y += motion ? (active ? 0.05 : 0.004) : 0;
    }
    if (beam.current) beam.current.visible = active;
    if (ring.current) ring.current.color.copy(active ? GREEN : BLUE).multiplyScalar(active ? 1.3 : 0.6);
  });

  return (
    <group>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[1.05, 1.15, 0.28, 48]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[0, 0.29, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.72, 0.78, 6]} />
        <meshBasicMaterial color={BLUE} transparent opacity={0.6} toneMapped={false} />
      </mesh>
      <mesh ref={module} position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.42, 0.42, MODULE_HEIGHT, 6]} />
        <meshPhysicalMaterial ref={moduleMaterial} color="#6fb6ff" transparent opacity={0.75} roughness={0.15} clearcoat={1} />
      </mesh>
      <group ref={gantry}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.8, 0.035, 8, 64]} />
          <meshBasicMaterial ref={ring} toneMapped={false} />
        </mesh>
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle) => (
          <mesh key={angle} position={[Math.cos(angle) * 0.8, 0, Math.sin(angle) * 0.8]}>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
        ))}
      </group>
      {/* Pylon with the emitter head the beam comes from. */}
      <mesh position={[0.95, 1.5, -0.6]}>
        <boxGeometry args={[0.12, 3.0, 0.12]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[0.45, 2.95, -0.3]} rotation={[0, 0.55, 0]}>
        <boxGeometry args={[1.1, 0.12, 0.14]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh ref={beam} position={[0, 2.0, 0]}>
        <cylinderGeometry args={[0.015, 0.06, 1.9, 8]} />
        <meshBasicMaterial color="#9dffd0" transparent opacity={0.8} toneMapped={false} />
      </mesh>
    </group>
  );
}
