import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, type Group, type InstancedMesh, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, Object3D } from 'three';
import { STATIONS_3D, type StationId } from '../layout3d.ts';
import { consoleTexture } from './consoleTexture.ts';

export type StationActivity = Readonly<Record<StationId, boolean>>;

const METAL = { color: '#0c1828', metalness: 0.7, roughness: 0.35 } as const;
const BLUE = new Color('#228dff');
const CYAN = new Color('#3dd6f5');
const GREEN = new Color('#2bd47d');
const AMBER = new Color('#f5b53d');

/** Point `distance` units ahead of a station spot, where its structure stands. */
function ahead(id: StationId, distance: number): [number, number, number] {
  const { position, facing } = STATIONS_3D[id];
  return [position[0] + Math.sin(facing) * distance, -0.6, position[2] + Math.cos(facing) * distance];
}

function Tag({ text, position }: { text: string; position: [number, number, number] }) {
  return (
    <Html position={position} center distanceFactor={13} zIndexRange={[10, 0]} pointerEvents="none">
      <div className="station-tag">{text}</div>
    </Html>
  );
}

function Command({ active, motion }: { active: boolean; motion: boolean }) {
  const rings = useRef<Group>(null);
  const glow = useRef<MeshBasicMaterial>(null);
  useFrame((_, delta) => {
    if (rings.current && motion) {
      rings.current.children.forEach((ring, i) => {
        ring.rotation.z += delta * (active ? 0.9 : 0.25) * (i % 2 ? -1 : 1);
      });
    }
    if (glow.current) glow.current.opacity = active ? 0.9 : 0.45;
  });
  const [x, , z] = STATIONS_3D.command.position;
  return (
    <group position={[x, -0.6, z]}>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[1.9, 2.1, 0.3, 64]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[0, 0.31, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.9, 0.025, 8, 96]} />
        <meshBasicMaterial ref={glow} color={BLUE} transparent toneMapped={false} />
      </mesh>
      <group ref={rings} position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        {[1.35, 1.05].map((radius) => (
          <mesh key={radius}>
            <torusGeometry args={[radius, 0.012, 6, 96, Math.PI * 1.6]} />
            <meshBasicMaterial color={CYAN} transparent opacity={active ? 0.85 : 0.35} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <Tag text="COMMAND" position={[0, 0.2, 2.4]} />
    </group>
  );
}

const SLABS_PER_PILLAR = 9;
const PILLAR_Z = [-1.7, 0, 1.7];

function Archive({ active, motion }: { active: boolean; motion: boolean }) {
  const slabs = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const [x, , z] = ahead('archive', 1.8);

  useEffect(() => {
    const mesh = slabs.current;
    if (!mesh) return;
    PILLAR_Z.forEach((pz, p) => {
      for (let s = 0; s < SLABS_PER_PILLAR; s += 1) {
        dummy.position.set(0.3, 0.5 + s * 0.48, pz);
        dummy.updateMatrix();
        mesh.setMatrixAt(p * SLABS_PER_PILLAR + s, dummy.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  useFrame(({ clock }) => {
    const mesh = slabs.current;
    if (!mesh) return;
    const t = motion ? clock.elapsedTime : 0;
    for (let i = 0; i < PILLAR_Z.length * SLABS_PER_PILLAR; i += 1) {
      const wave = active ? 0.55 + 0.45 * Math.sin(t * 3 - i * 0.7) : 0.25 + 0.1 * Math.sin(t * 0.5 + i);
      mesh.setColorAt(i, color.copy(CYAN).multiplyScalar(wave));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group position={[x, 0, z]}>
      {PILLAR_Z.map((pz) => (
        <mesh key={pz} position={[-0.15, 2.1, pz]}>
          <boxGeometry args={[0.5, 4.6, 1.2]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      ))}
      <instancedMesh ref={slabs} args={[undefined, undefined, PILLAR_Z.length * SLABS_PER_PILLAR]}>
        <boxGeometry args={[0.12, 0.08, 1.0]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <Tag text="KNOWLEDGE ARCHIVE" position={[1.6, -0.45, 0]} />
    </group>
  );
}

function Console({ active, motion }: { active: boolean; motion: boolean }) {
  const texture = useMemo(() => consoleTexture(), []);
  const screens = useRef<(MeshBasicMaterial | null)[]>([]);
  const [x, , z] = ahead('console', 1.8);
  useFrame((_, delta) => {
    if (motion) texture.offset.y += delta * (active ? 0.12 : 0.015);
    screens.current.forEach((material) => {
      if (material) material.opacity = active ? 0.95 : 0.5;
    });
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0.25, 0.45, 0]}>
        <boxGeometry args={[0.8, 0.9, 5.2]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      {[-1.75, 0, 1.75].map((sz, index) => (
        <group key={sz} position={[-0.05, 2.0, sz]} rotation={[0, -Math.PI / 2 + (index - 1) * -0.25, 0]}>
          <mesh>
            <planeGeometry args={[1.55, 1.15]} />
            <meshBasicMaterial
              ref={(material) => {
                screens.current[index] = material;
              }}
              map={texture}
              transparent
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[1.65, 1.25]} />
            <meshBasicMaterial color={BLUE} transparent opacity={active ? 0.5 : 0.18} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <Tag text="KEBOOLA CONSOLE" position={[-1.6, -0.45, 0]} />
    </group>
  );
}

function Forge({ active, motion }: { active: boolean; motion: boolean }) {
  const blueprint = useRef<Mesh>(null);
  const [x, , z] = ahead('forge', 1.6);
  useFrame((_, delta) => {
    const mesh = blueprint.current;
    if (!mesh) return;
    if (motion) {
      mesh.rotation.y += delta * (active ? 1.2 : 0.2);
      mesh.rotation.x += delta * (active ? 0.5 : 0.08);
    }
    (mesh.material as MeshBasicMaterial).color.copy(active ? GREEN : BLUE).multiplyScalar(active ? 1.4 : 0.6);
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[1.2, 1.35, 0.4, 6]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh ref={blueprint} position={[0, 1.7, 0]}>
        <icosahedronGeometry args={[0.65, 1]} />
        <meshBasicMaterial wireframe toneMapped={false} />
      </mesh>
      <Tag text="BUILD" position={[0.4, -0.45, 1.8]} />
    </group>
  );
}

function Beacon({ active, motion }: { active: boolean; motion: boolean }) {
  const lamp = useRef<MeshStandardMaterial>(null);
  const [x, , z] = ahead('beacon', 1.6);
  useFrame(({ clock }) => {
    if (!lamp.current) return;
    const pulse = active && motion ? 0.6 + 0.4 * Math.sin(clock.elapsedTime * 5) : 1;
    lamp.current.emissiveIntensity = active ? 3.5 * pulse : 0.08;
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.08, 0.16, 2.2, 12]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[0, 2.35, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.38, 20]} />
        <meshStandardMaterial ref={lamp} color="#3a2f17" emissive={AMBER} toneMapped={false} />
      </mesh>
      <mesh position={[0, 2.35, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.32, 0.015, 6, 48]} />
        <meshBasicMaterial color={AMBER} transparent opacity={active ? 0.9 : 0.25} toneMapped={false} />
      </mesh>
      {active && <pointLight position={[0, 2.4, 0]} color={AMBER} intensity={6} distance={7} />}
      <Tag text="APPROVALS" position={[0, -0.45, 1.2]} />
    </group>
  );
}

/** All work stations; an active station glows and animates faster. */
export function Stations({ active, motion }: { active: StationActivity; motion: boolean }) {
  return (
    <group>
      <Command active={active.command} motion={motion} />
      <Archive active={active.archive} motion={motion} />
      <Console active={active.console} motion={motion} />
      <Forge active={active.forge} motion={motion} />
      <Beacon active={active.beacon} motion={motion} />
    </group>
  );
}
