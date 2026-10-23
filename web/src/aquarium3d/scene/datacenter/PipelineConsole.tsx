import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, DoubleSide, type Mesh, type MeshBasicMaterial, Vector3 } from 'three';
import { labelTexture } from './labelTexture.ts';

const BLUE = new Color('#228dff');
const CYAN = new Color('#3dd6f5');
const METAL = { color: '#0d1520', metalness: 0.75, roughness: 0.35 } as const;

/** The analyst's pipeline shape, drawn on the hologram: sources -> raw -> lake -> DWH -> outputs. */
const NODES = [
  { id: 'src1', label: 'SRC', at: [-1.45, 0.42] },
  { id: 'src2', label: 'SRC', at: [-1.45, -0.18] },
  { id: 'raw', label: 'RAW', at: [-0.62, 0.12] },
  { id: 'lake', label: 'LAKE', at: [0.18, 0.12] },
  { id: 'dwh', label: 'DWH', at: [0.98, 0.12] },
  { id: 'out', label: 'BI', at: [1.62, 0.12] },
] as const;
const EDGES = [['src1', 'raw'], ['src2', 'raw'], ['raw', 'lake'], ['lake', 'dwh'], ['dwh', 'out']] as const;
const NODE_SIZE = [0.5, 0.26] as const;

const point = (id: string): Vector3 => {
  const node = NODES.find((entry) => entry.id === id);
  return new Vector3(node?.at[0] ?? 0, node?.at[1] ?? 0, 0.01);
};

/**
 * Keboola station: a curved console with a holographic pipeline above it. While an agent works in
 * Keboola the nodes light up in order and data packets flow along the edges.
 */
export function PipelineConsole({ active, motion }: { active: boolean; motion: boolean }) {
  const nodeMaterials = useRef<(MeshBasicMaterial | null)[]>([]);
  const packets = useRef<(Mesh | null)[]>([]);
  const edges = useMemo(() => EDGES.map(([from, to]) => [point(from), point(to)] as const), []);
  const panel = useRef<MeshBasicMaterial>(null);
  const color = useMemo(() => new Color(), []);

  useFrame(({ clock }) => {
    const t = motion ? clock.elapsedTime : 0;
    NODES.forEach((_, i) => {
      const material = nodeMaterials.current[i];
      if (!material) return;
      const wave = active ? 0.55 + 0.6 * Math.max(0, Math.sin(t * 2.2 - i * 0.9)) : 0.35;
      material.color.copy(color.copy(BLUE).lerp(CYAN, active ? 0.4 : 0)).multiplyScalar(wave);
    });
    edges.forEach(([from, to], i) => {
      const packet = packets.current[i];
      if (!packet) return;
      packet.visible = active;
      const progress = (t * 0.6 + i * 0.27) % 1;
      packet.position.lerpVectors(from, to, progress);
    });
    if (panel.current) panel.current.opacity = active ? 0.22 : 0.1;
  });

  return (
    <group>
      {/* Curved console desk facing the agents (−x in this group's frame). */}
      <mesh position={[0.6, 0.45, 0]} rotation={[0, Math.PI, 0]}>
        <cylinderGeometry args={[1.9, 2.0, 0.9, 48, 1, false, -0.8, 1.6]} />
        <meshStandardMaterial {...METAL} side={DoubleSide} />
      </mesh>
      <mesh position={[-1.32, 0.92, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.05, 0.03, 2.6]} />
        <meshBasicMaterial color={BLUE} toneMapped={false} />
      </mesh>
      {/* The hologram: a faint panel with the pipeline graph on it, turned toward the agents. */}
      {/* Turned between the agent at the console and the viewer so the graph stays readable. */}
      <group position={[-0.1, 2.35, 0.3]} rotation={[0, -1.05, 0]} scale={1.35}>
        <mesh position={[0, 0.1, -0.02]}>
          <planeGeometry args={[3.7, 1.35]} />
          <meshBasicMaterial ref={panel} color="#0b3b6e" transparent opacity={0.12} toneMapped={false} side={DoubleSide} depthWrite={false} />
        </mesh>
        {edges.map(([from, to], i) => (
          <Line key={EDGES[i]?.join('-')} points={[from, to]} color="#3d9bff" lineWidth={1.4} transparent opacity={0.7} />
        ))}
        {NODES.map((node, i) => (
          <group key={node.id} position={[node.at[0], node.at[1], 0]}>
            <mesh>
              <planeGeometry args={[NODE_SIZE[0], NODE_SIZE[1]]} />
              <meshBasicMaterial
                ref={(material) => {
                  nodeMaterials.current[i] = material;
                }}
                transparent
                opacity={0.85}
                toneMapped={false}
                side={DoubleSide}
              />
            </mesh>
            <mesh position={[0, 0, 0.01]}>
              <planeGeometry args={[NODE_SIZE[0] * 0.9, NODE_SIZE[1] * 0.8]} />
              <meshBasicMaterial map={labelTexture(node.label, '#eaf6ff')} transparent toneMapped={false} side={DoubleSide} depthWrite={false} />
            </mesh>
          </group>
        ))}
        {edges.map((_, i) => (
          <mesh
            key={`packet-${i}`}
            ref={(mesh) => {
              packets.current[i] = mesh;
            }}
          >
            <sphereGeometry args={[0.045, 10, 8]} />
            <meshBasicMaterial color="#bff4ff" toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
