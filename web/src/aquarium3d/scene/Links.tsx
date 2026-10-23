import { QuadraticBezierLine } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { QuadraticBezierCurve3, Vector3 } from 'three';

type LineHandle = { setPoints: (start: Vector3, end: Vector3, mid: Vector3) => void };

/** A faint, steady arc from the lead to an agent it delegated to: visible, never flashing. Follows both while they swim. */
function Link({ from, to, positions }: { from: string; to: string; positions: ReadonlyMap<string, Vector3> }) {
  const line = useRef<LineHandle | null>(null);
  const curve = useMemo(() => new QuadraticBezierCurve3(new Vector3(), new Vector3(), new Vector3()), []);

  useFrame(() => {
    const start = positions.get(from);
    const end = positions.get(to);
    if (!line.current || !start || !end) return;
    curve.v0.copy(start).setY(start.y + 0.5);
    curve.v2.copy(end).setY(end.y + 0.5);
    curve.v1.copy(curve.v0).add(curve.v2).multiplyScalar(0.5);
    curve.v1.y += 1.4 + start.distanceTo(end) * 0.1;
    line.current.setPoints(curve.v0, curve.v2, curve.v1);
  });

  return (
    <QuadraticBezierLine
      ref={line as never}
      start={[0, 0, 0]}
      end={[0, 0, 0]}
      color="#7fc8ff"
      lineWidth={1.2}
      transparent
      opacity={0.28}
      depthWrite={false}
    />
  );
}

export function Links({ lead, targets, positions }: { lead: string; targets: readonly string[]; positions: ReadonlyMap<string, Vector3> }) {
  return (
    <group>
      {targets.map((target) => (
        <Link key={target} from={lead} to={target} positions={positions} />
      ))}
    </group>
  );
}
