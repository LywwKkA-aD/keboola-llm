import { QuadraticBezierLine } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3 } from 'three';

type LineHandle = {
  setPoints: (start: Vector3, end: Vector3, mid: Vector3) => void;
  material: { dashOffset: number };
};

/** A glowing dashed arc from the lead to an agent it delegated to; follows both while they swim. */
function Link({ from, to, positions, motion }: { from: string; to: string; positions: ReadonlyMap<string, Vector3>; motion: boolean }) {
  const line = useRef<LineHandle | null>(null);
  const mid = useRef(new Vector3());
  useFrame((_, delta) => {
    const start = positions.get(from);
    const end = positions.get(to);
    if (!line.current || !start || !end) return;
    mid.current.copy(start).add(end).multiplyScalar(0.5);
    mid.current.y += 1.6 + start.distanceTo(end) * 0.12;
    line.current.setPoints(start, end, mid.current);
    if (motion) line.current.material.dashOffset -= delta * 1.5;
  });
  return (
    <QuadraticBezierLine
      ref={line as never}
      start={[0, 0, 0]}
      end={[0, 0, 0]}
      color="#3dd6f5"
      lineWidth={1.6}
      dashed
      dashSize={0.35}
      gapSize={0.25}
      transparent
      opacity={0.85}
      toneMapped={false}
    />
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
