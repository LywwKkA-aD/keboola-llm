import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, Color, type Group, type MeshBasicMaterial } from 'three';
import { APPROVAL_DAIS, STATIONS_3D, stationSlots } from '../../layout3d.ts';

const FLOOR = -0.6;
const METAL = { color: '#0d1520', metalness: 0.75, roughness: 0.35 } as const;
const AMBER = new Color('#f5b53d');
const IDLE = new Color('#2a4c6e');

/**
 * Approvals: a waiting area. Agents waiting for the user stand on their own pads in front of a low dais;
 * above it a ring with a turning hexagonal frame and a column of light glow amber while anyone waits.
 */
export function WaitingArea({ waiting, motion }: { waiting: number; motion: boolean }) {
  const pads = useMemo(() => stationSlots('beacon'), []);
  const padMaterials = useRef<(MeshBasicMaterial | null)[]>([]);
  const ring = useRef<MeshBasicMaterial>(null);
  const hex = useRef<Group>(null);
  const hexMaterial = useRef<MeshBasicMaterial>(null);
  const column = useRef<MeshBasicMaterial>(null);
  const color = useMemo(() => new Color(), []);
  const { facing } = STATIONS_3D.beacon;
  const center: [number, number, number] = [APPROVAL_DAIS[0], FLOOR, APPROVAL_DAIS[2]];
  const active = waiting > 0;

  useFrame(({ clock }, delta) => {
    const t = motion ? clock.elapsedTime : 0;
    const pulse = active && motion ? 0.6 + 0.4 * Math.sin(t * 4) : 1;
    color.copy(active ? AMBER : IDLE).multiplyScalar(active ? 1.2 * pulse : 0.8);
    ring.current?.color.copy(color);
    hexMaterial.current?.color.copy(color);
    if (hex.current && motion) hex.current.rotation.z += delta * (active ? 0.8 : 0.15);
    if (column.current) column.current.opacity = active ? 0.18 * pulse : 0;
    padMaterials.current.forEach((material, i) => {
      if (!material) return;
      material.color.copy(i < waiting ? AMBER : IDLE);
      material.opacity = i < waiting ? 0.9 * pulse : 0.35;
    });
  });

  return (
    <group>
      {pads.map(([x, , z], i) => (
        <group key={i} position={[x ?? 0, FLOOR, z ?? 0]}>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.5, 0.56, 0.06, 32]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
          <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.38, 0.46, 40]} />
            <meshBasicMaterial
              ref={(material) => {
                padMaterials.current[i] = material;
              }}
              transparent
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      <group position={center} rotation={[0, facing, 0]}>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[1.1, 1.25, 0.2, 6]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
        <mesh position={[0, 0.85, 0]}>
          <cylinderGeometry args={[0.3, 0.45, 1.5, 24, 1, true]} />
          <meshBasicMaterial ref={column} color={AMBER} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
        <group position={[0, 1.45, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.85, 0.03, 8, 72]} />
            <meshBasicMaterial ref={ring} toneMapped={false} />
          </mesh>
          <group ref={hex} rotation={[Math.PI / 2, 0, 0]}>
            <mesh>
              <torusGeometry args={[0.55, 0.02, 4, 6]} />
              <meshBasicMaterial ref={hexMaterial} toneMapped={false} />
            </mesh>
          </group>
        </group>
      </group>
      {active && <pointLight position={[center[0], 2.4, center[2]]} color={AMBER} intensity={5} distance={7} />}
    </group>
  );
}
