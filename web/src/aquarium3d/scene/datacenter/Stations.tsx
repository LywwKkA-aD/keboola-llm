import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, type Group, type InstancedMesh, type MeshBasicMaterial, Object3D } from 'three';
import { APPROVAL_DAIS, BUILD_AHEAD, STATIONS_3D, type StationId } from '../../layout3d.ts';
import { Label } from '../Label.tsx';
import { Fabricator } from './Fabricator.tsx';
import { WaitingArea } from './WaitingArea.tsx';
import { Workstations } from './Workstations.tsx';

export type StationActivity = Readonly<Record<StationId, boolean>>;
export type StationOccupancy = Readonly<Record<StationId, number>>;

const FLOOR = -0.6;
const METAL = { color: '#0d1520', metalness: 0.75, roughness: 0.35 } as const;
const BLUE = new Color('#228dff');
const CYAN = new Color('#3dd6f5');

/** Point `distance` units ahead of a station spot, on the floor, where its equipment stands. */
function ahead(id: StationId, distance: number): [number, number, number] {
  const { position, facing } = STATIONS_3D[id];
  return [position[0] + Math.sin(facing) * distance, FLOOR, position[2] + Math.cos(facing) * distance];
}

function Tag({ text, position }: { text: string; position: [number, number, number] }) {
  return (
    <Label position={position} center distanceFactor={14} zIndexRange={[10, 0]} pointerEvents="none">
      <div className="station-tag">{text}</div>
    </Label>
  );
}

/** The lead's operations platform: a glowing ring and slowly turning hologram rings, faster while it plans. */
function OpsDesk({ active, motion }: { active: boolean; motion: boolean }) {
  const rings = useRef<Group>(null);
  const edge = useRef<MeshBasicMaterial>(null);
  useFrame((_, delta) => {
    if (rings.current && motion) {
      rings.current.children.forEach((ring, i) => {
        ring.rotation.z += delta * (active ? 0.8 : 0.2) * (i % 2 ? -1 : 1);
      });
    }
    if (edge.current) edge.current.opacity = active ? 0.95 : 0.5;
  });
  const [x, , z] = STATIONS_3D.command.position;
  return (
    <group position={[x, FLOOR, z]}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[1.9, 2.05, 0.24, 64]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[0, 0.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.9, 0.022, 8, 96]} />
        <meshBasicMaterial ref={edge} color={BLUE} transparent toneMapped={false} />
      </mesh>
      <group ref={rings} position={[0, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        {[1.4, 1.1].map((radius) => (
          <mesh key={radius}>
            <torusGeometry args={[radius, 0.01, 6, 96, Math.PI * 1.6]} />
            <meshBasicMaterial color={CYAN} transparent opacity={active ? 0.8 : 0.3} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <Tag text="LEAD" position={[0, 0.1, 2.5]} />
    </group>
  );
}

const DRIVES_PER_RACK = 14;
const STORAGE_Z = [-1.25, 0, 1.25];

/** Storage racks of the knowledge base; drive lights sweep while an agent reads. */
function StorageRacks({ active, motion }: { active: boolean; motion: boolean }) {
  const drives = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const [x, , z] = ahead('archive', 1.9);
  useEffect(() => {
    STORAGE_Z.forEach((rz, r) => {
      for (let d = 0; d < DRIVES_PER_RACK; d += 1) {
        dummy.position.set(0.52, 0.3 + d * 0.22, rz);
        dummy.updateMatrix();
        drives.current?.setMatrixAt(r * DRIVES_PER_RACK + d, dummy.matrix);
        drives.current?.setColorAt(r * DRIVES_PER_RACK + d, CYAN);
      }
    });
    if (drives.current) drives.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);
  useFrame(({ clock }) => {
    const mesh = drives.current;
    if (!mesh) return;
    const t = motion ? clock.elapsedTime : 0;
    for (let i = 0; i < STORAGE_Z.length * DRIVES_PER_RACK; i += 1) {
      const level = active ? 0.4 + 1.2 * Math.max(0, Math.sin(t * 5 - i * 0.45)) : 0.25 + 0.1 * Math.sin(t * 0.8 + i);
      mesh.setColorAt(i, color.copy(CYAN).multiplyScalar(level));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <group position={[x, 0, z]}>
      {STORAGE_Z.map((rz) => (
        <mesh key={rz} position={[0, 1.65, rz]}>
          <boxGeometry args={[1, 3.3, 1.1]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      ))}
      <instancedMesh ref={drives} args={[undefined, undefined, STORAGE_Z.length * DRIVES_PER_RACK]}>
        <boxGeometry args={[0.02, 0.06, 0.8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <Tag text="KNOWLEDGE" position={[1.6, 0.1, 0]} />
    </group>
  );
}

/** Data-centre equipment that doubles as work stations; equipment in use glows and moves more. */
export function Stations({ active, occupancy, motion }: { active: StationActivity; occupancy: StationOccupancy; motion: boolean }) {
  return (
    <group>
      <OpsDesk active={active.command} motion={motion} />
      <StorageRacks active={active.archive} motion={motion} />
      <Workstations occupied={occupancy.console} motion={motion} />
      <Tag text="KEBOOLA" position={ahead('console', -1.2)} />
      <group position={ahead('forge', BUILD_AHEAD)} rotation={[0, STATIONS_3D.forge.facing + Math.PI * 0.75, 0]}>
        <Fabricator active={active.forge} motion={motion} />
      </group>
      <Tag text="BUILD" position={[-(APPROVAL_DAIS[0] + 0.2), -0.5, APPROVAL_DAIS[2] + 1.6]} />
      <WaitingArea waiting={occupancy.beacon} motion={motion} />
      <Tag text="APPROVALS" position={[APPROVAL_DAIS[0] + 0.2, -0.5, APPROVAL_DAIS[2] + 1.6]} />
    </group>
  );
}
