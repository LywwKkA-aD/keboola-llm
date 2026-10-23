import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, type Group, type InstancedMesh, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, Object3D } from 'three';
import { STATIONS_3D, type StationId } from '../../layout3d.ts';
import { consoleTexture } from './consoleTexture.ts';

export type StationActivity = Readonly<Record<StationId, boolean>>;

const FLOOR = -0.6;
const METAL = { color: '#0d1520', metalness: 0.75, roughness: 0.35 } as const;
const BLUE = new Color('#228dff');
const CYAN = new Color('#3dd6f5');
const GREEN = new Color('#2bd47d');
const AMBER = new Color('#f5b53d');

/** Point `distance` units ahead of a station spot, on the floor, where its equipment stands. */
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

/** A workstation of terminals with SQL scrolling over the screens: where agents work in Keboola. */
function Terminals({ active, motion }: { active: boolean; motion: boolean }) {
  const texture = useMemo(() => consoleTexture(), []);
  const screens = useRef<(MeshBasicMaterial | null)[]>([]);
  const [x, , z] = ahead('console', 1.8);
  useFrame((_, delta) => {
    if (motion) texture.offset.y += delta * (active ? 0.12 : 0.012);
    screens.current.forEach((material) => {
      if (material) material.opacity = active ? 0.95 : 0.45;
    });
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0.25, 0.45, 0]}>
        <boxGeometry args={[0.8, 0.9, 4.6]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[0.75, 1.1, -2.6]}>
        <boxGeometry args={[0.7, 2.2, 0.8]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      {[-1.55, 0, 1.55].map((sz, index) => (
        <group key={sz} position={[0.1, 1.75, sz]} rotation={[0, -Math.PI / 2 + (index - 1) * -0.22, 0]}>
          <mesh>
            <planeGeometry args={[1.4, 0.95]} />
            <meshBasicMaterial
              ref={(material) => {
                screens.current[index] = material;
              }}
              map={texture}
              transparent
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, -0.02]}>
            <boxGeometry args={[1.5, 1.05, 0.03]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
        </group>
      ))}
      <Tag text="KEBOOLA" position={[-1.6, 0.1, 0]} />
    </group>
  );
}

/** A build bay: an open rack frame with a holographic blueprint turning inside; green while agents write. */
function BuildBay({ active, motion }: { active: boolean; motion: boolean }) {
  const blueprint = useRef<Mesh>(null);
  const [x, , z] = ahead('forge', 1.7);
  useFrame((_, delta) => {
    const mesh = blueprint.current;
    if (!mesh) return;
    if (motion) mesh.rotation.y += delta * (active ? 1.1 : 0.15);
    (mesh.material as MeshBasicMaterial).color.copy(active ? GREEN : BLUE).multiplyScalar(active ? 1.4 : 0.55);
  });
  const posts: [number, number][] = [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]];
  return (
    <group position={[x, 0, z]} rotation={[0, STATIONS_3D.forge.facing, 0]}>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[1.6, 0.12, 1.6]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      {posts.map(([px, pz]) => (
        <mesh key={`${px}${pz}`} position={[px, 1.4, pz]}>
          <boxGeometry args={[0.07, 2.7, 0.07]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      ))}
      <mesh position={[0, 2.75, 0]}>
        <boxGeometry args={[1.35, 0.07, 1.35]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh ref={blueprint} position={[0, 1.45, 0]}>
        <icosahedronGeometry args={[0.5, 1]} />
        <meshBasicMaterial wireframe toneMapped={false} />
      </mesh>
      <Tag text="BUILD" position={[0, 0.1, 1.4]} />
    </group>
  );
}

/** A status light tower; the amber lamp pulses while someone waits for the user's approval. */
function StatusTower({ active, motion }: { active: boolean; motion: boolean }) {
  const amber = useRef<MeshStandardMaterial>(null);
  const [x, , z] = ahead('beacon', 1.4);
  useFrame(({ clock }) => {
    if (!amber.current) return;
    const pulse = active && motion ? 0.55 + 0.45 * Math.sin(clock.elapsedTime * 5) : 1;
    amber.current.emissiveIntensity = active ? 3.2 * pulse : 0.12;
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.06, 0.12, 1.8, 12]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      {[
        { y: 1.95, color: GREEN, ref: undefined, lit: 0.6 },
        { y: 2.25, color: AMBER, ref: amber, lit: 0 },
        { y: 2.55, color: new Color('#ff5c5c'), ref: undefined, lit: 0.08 },
      ].map(({ y, color, ref, lit }) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.26, 20]} />
          <meshStandardMaterial ref={ref} color="#1b1f26" emissive={color} emissiveIntensity={lit} toneMapped={false} />
        </mesh>
      ))}
      {active && <pointLight position={[0, 2.25, 0]} color={AMBER} intensity={5} distance={6} />}
      <Tag text="APPROVALS" position={[0, 0.1, 1.1]} />
    </group>
  );
}

/** Data-centre equipment that doubles as work stations; equipment in use glows and moves more. */
export function Stations({ active, motion }: { active: StationActivity; motion: boolean }) {
  return (
    <group>
      <OpsDesk active={active.command} motion={motion} />
      <StorageRacks active={active.archive} motion={motion} />
      <Terminals active={active.console} motion={motion} />
      <BuildBay active={active.forge} motion={motion} />
      <StatusTower active={active.beacon} motion={motion} />
    </group>
  );
}
