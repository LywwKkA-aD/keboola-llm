import { Html } from '@react-three/drei';
import { STATIONS_3D, type StationId } from '../layout3d.ts';
import { Clam } from './natural/Clam.tsx';
import { Coral } from './natural/Coral.tsx';
import { CouncilRock } from './natural/CouncilRock.tsx';
import { Crystals } from './natural/Crystals.tsx';
import { Lantern } from './natural/Lantern.tsx';

export type StationActivity = Readonly<Record<StationId, boolean>>;

const FLOOR = -0.6;

/** Point `distance` units ahead of a station spot, on the seabed, where its formation grows. */
function ahead(id: StationId, distance: number): [number, number, number] {
  const { position, facing } = STATIONS_3D[id];
  return [position[0] + Math.sin(facing) * distance, FLOOR, position[2] + Math.cos(facing) * distance];
}

function Tag({ text, position }: { text: string; position: [number, number, number] }) {
  return (
    <Html position={position} center distanceFactor={14} zIndexRange={[10, 0]} pointerEvents="none">
      <div className="station-tag">{text}</div>
    </Html>
  );
}

/**
 * Natural formations that double as work stations: the lead's council rock, memory coral (knowledge),
 * data crystals (Keboola), the pearl clam (building) and the lantern plant (approvals).
 * A station in use glows and moves more.
 */
export function Stations({ active, motion }: { active: StationActivity; motion: boolean }) {
  const command = STATIONS_3D.command.position;
  return (
    <group>
      <group position={[command[0], FLOOR, command[2]]}>
        <CouncilRock active={active.command} motion={motion} />
        <Tag text="LEAD" position={[0, 0.1, 2.6]} />
      </group>
      <group position={ahead('archive', 2.1)}>
        <group position={[-0.2, 0, -1.1]}>
          <Coral seed={11} scale={1.55} active={active.archive} motion={motion} />
        </group>
        <group position={[0.3, 0, 1.0]}>
          <Coral seed={23} scale={1.2} active={active.archive} motion={motion} />
        </group>
        <Tag text="KNOWLEDGE" position={[1.7, 0.1, 0]} />
      </group>
      <group position={ahead('console', 2.0)}>
        <Crystals active={active.console} motion={motion} />
        <Tag text="KEBOOLA" position={[-1.8, 0.1, 0]} />
      </group>
      <group position={ahead('forge', 1.7)} rotation={[0, STATIONS_3D.forge.facing + Math.PI, 0]}>
        <Clam active={active.forge} motion={motion} />
        <Tag text="BUILD" position={[0, 0.1, -1.8]} />
      </group>
      <group position={ahead('beacon', 1.4)}>
        <Lantern active={active.beacon} motion={motion} />
        <Tag text="APPROVALS" position={[0, 0.1, 1.2]} />
      </group>
    </group>
  );
}
