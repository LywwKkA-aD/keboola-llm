import { QuadraticBezierLine } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { type Mesh, QuadraticBezierCurve3, SphereGeometry, Vector3 } from 'three';

type LineHandle = {
  setPoints: (start: Vector3, end: Vector3, mid: Vector3) => void;
  material: { dashOffset: number };
};

const PACKETS = 3;
const PACKET_SPEED = 0.45;
const packetGeometry = new SphereGeometry(0.07, 12, 10);

/**
 * A dashed arc from the lead to an agent it delegated to, with glowing data packets flowing along it.
 * Both ends follow the octopuses while they swim.
 */
function Link({ from, to, positions, motion }: { from: string; to: string; positions: ReadonlyMap<string, Vector3>; motion: boolean }) {
  const line = useRef<LineHandle | null>(null);
  const packets = useRef<(Mesh | null)[]>([]);
  const curve = useMemo(() => new QuadraticBezierCurve3(new Vector3(), new Vector3(), new Vector3()), []);
  const point = useMemo(() => new Vector3(), []);

  useFrame(({ clock }, delta) => {
    const start = positions.get(from);
    const end = positions.get(to);
    if (!line.current || !start || !end) return;
    curve.v0.copy(start).setY(start.y + 0.5);
    curve.v2.copy(end).setY(end.y + 0.5);
    curve.v1.copy(curve.v0).add(curve.v2).multiplyScalar(0.5);
    curve.v1.y += 1.6 + start.distanceTo(end) * 0.12;
    line.current.setPoints(curve.v0, curve.v2, curve.v1);
    if (motion) line.current.material.dashOffset -= delta * 1.5;
    packets.current.forEach((packet, index) => {
      if (!packet) return;
      const t = motion ? (clock.elapsedTime * PACKET_SPEED + index / PACKETS) % 1 : (index + 0.5) / PACKETS;
      curve.getPoint(t, point);
      packet.position.copy(point);
      packet.scale.setScalar(0.6 + Math.sin(t * Math.PI) * 0.6);
    });
  });

  return (
    <group>
      <QuadraticBezierLine
        ref={line as never}
        start={[0, 0, 0]}
        end={[0, 0, 0]}
        color="#3dd6f5"
        lineWidth={1.4}
        dashed
        dashSize={0.3}
        gapSize={0.3}
        transparent
        opacity={0.6}
        toneMapped={false}
      />
      {Array.from({ length: PACKETS }, (_, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            packets.current[index] = mesh;
          }}
          geometry={packetGeometry}
        >
          <meshBasicMaterial color="#9feaff" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export function Links({ lead, targets, positions, motion }: {
  lead: string;
  targets: readonly string[];
  positions: ReadonlyMap<string, Vector3>;
  motion: boolean;
}) {
  return (
    <group>
      {targets.map((target) => (
        <Link key={target} from={lead} to={target} positions={positions} motion={motion} />
      ))}
    </group>
  );
}
