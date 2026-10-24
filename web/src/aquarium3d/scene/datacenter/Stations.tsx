import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, type Group, type InstancedMesh, type MeshBasicMaterial, Object3D } from 'three';
import { FLOOR_Y, STATION_SPOTS } from '../../floorplan.ts';
import { STATIONS_3D, type StationId } from '../../layout3d.ts';
import type { Vec3 } from '../../mascot.ts';
import { Label } from '../Label.tsx';
import { Fabricator } from './Fabricator.tsx';
import { WaitingArea } from './WaitingArea.tsx';
import { Workstations } from './Workstations.tsx';

export type StationActivity = Readonly<Record<StationId, boolean>>;
export type StationOccupancy = Readonly<Record<StationId, number>>;

const METAL = { color: '#0d1520', metalness: 0.75, roughness: 0.35 } as const;
const BLUE = new Color('#228dff');
const CYAN = new Color('#3dd6f5');
/** Hanging signs over the stations, high enough to read over the racks. */
const SIGN_Y = 4.3;

/** The middle of a station's places, `ahead` units further in the direction its agents face. */
function stationPoint(id: StationId, ahead: number): Vec3 {
  const places = STATION_SPOTS[id];
  const x = places.reduce((sum, [px]) => sum + px, 0) / places.length;
  const z = places.reduce((sum, [, , pz]) => sum + pz, 0) / places.length;
  const { facing } = STATIONS_3D[id];
  return [x + Math.sin(facing) * ahead, FLOOR_Y, z + Math.cos(facing) * ahead];
}

function Sign({ text, at }: { text: string; at: Vec3 }) {
  return (
    <Label position={[at[0], SIGN_Y, at[2]]} center distanceFactor={16} zIndexRange={[10, 0]} pointerEvents="none">
      <div className="station-tag">{text}</div>
    </Label>
  );
}

/** The lead's dais on the operations floor: a glowing ring and slowly turning hologram rings, faster while it plans. */
function CommandDais({ active, motion }: { active: boolean; motion: boolean }) {
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
    <group position={[x, FLOOR_Y, z]}>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[1.5, 1.62, 0.2, 64]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[0, 0.21, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.5, 0.022, 8, 96]} />
        <meshBasicMaterial ref={edge} color={BLUE} transparent toneMapped={false} />
      </mesh>
      <group ref={rings} position={[0, 0.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
        {[1.15, 0.9].map((radius) => (
          <mesh key={radius}>
            <torusGeometry args={[radius, 0.01, 6, 96, Math.PI * 1.6]} />
            <meshBasicMaterial color={CYAN} transparent opacity={active ? 0.8 : 0.3} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const CABINETS = 7;
const DRIVES_PER_CABINET = 12;
const CABINET_GAP = 1.25;

/** The knowledge archive: a tape library along the left wall; drive lights sweep while an agent reads. */
function TapeLibrary({ active, motion }: { active: boolean; motion: boolean }) {
  const drives = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const [x, , z] = stationPoint('archive', 1.35);
  const offsets = useMemo(() => Array.from({ length: CABINETS }, (_, i) => (i - (CABINETS - 1) / 2) * CABINET_GAP), []);
  const count = CABINETS * DRIVES_PER_CABINET;
  useEffect(() => {
    offsets.forEach((offset, c) => {
      for (let d = 0; d < DRIVES_PER_CABINET; d += 1) {
        dummy.position.set(0.52, 0.3 + d * 0.2, offset);
        dummy.updateMatrix();
        drives.current?.setMatrixAt(c * DRIVES_PER_CABINET + d, dummy.matrix);
        drives.current?.setColorAt(c * DRIVES_PER_CABINET + d, CYAN);
      }
    });
    if (drives.current) drives.current.instanceMatrix.needsUpdate = true;
  }, [dummy, offsets]);
  useFrame(({ clock }) => {
    const mesh = drives.current;
    if (!mesh) return;
    const t = motion ? clock.elapsedTime : 0;
    for (let i = 0; i < count; i += 1) {
      const level = active ? 0.4 + 1.2 * Math.max(0, Math.sin(t * 5 - i * 0.45)) : 0.25 + 0.1 * Math.sin(t * 0.8 + i);
      mesh.setColorAt(i, color.copy(CYAN).multiplyScalar(level));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <group position={[x, 0, z]}>
      {offsets.map((offset) => (
        <mesh key={offset} position={[0, FLOOR_Y + 1.5, offset]}>
          <boxGeometry args={[1, 3.0, 1.12]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      ))}
      <instancedMesh ref={drives} args={[undefined, undefined, count]} position={[0, FLOOR_Y, 0]}>
        <boxGeometry args={[0.02, 0.06, 0.8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** The data-centre equipment that doubles as work stations; equipment in use glows and moves more. */
export function Stations({ active, occupancy, motion }: { active: StationActivity; occupancy: StationOccupancy; motion: boolean }) {
  const build = stationPoint('forge', 1.6);
  return (
    <group>
      <CommandDais active={active.command} motion={motion} />
      <Sign text="LEAD" at={[STATIONS_3D.command.position[0], 0, STATIONS_3D.command.position[2] - 1.2]} />
      <TapeLibrary active={active.archive} motion={motion} />
      <Sign text="KNOWLEDGE" at={stationPoint('archive', -0.9)} />
      <Workstations occupied={occupancy.console} motion={motion} />
      <Sign text="KEBOOLA" at={stationPoint('console', -0.9)} />
      <group position={build}>
        <Fabricator active={active.forge} motion={motion} />
      </group>
      <Sign text="BUILD" at={stationPoint('forge', 0.4)} />
      <WaitingArea waiting={occupancy.beacon} motion={motion} />
      <Sign text="APPROVALS" at={stationPoint('beacon', 0.4)} />
    </group>
  );
}
