import { reefSpot } from '../../layout3d.ts';

/** Charging docks on the far arc where resting agents wait, each with a soft blue ring. */
export function Docks({ count }: { count: number }) {
  return (
    <group>
      {Array.from({ length: count }, (_, index) => {
        const { position } = reefSpot(index);
        return (
          <group key={index} position={[position[0], -0.6, position[2]]}>
            <mesh position={[0, 0.04, 0]}>
              <cylinderGeometry args={[0.5, 0.58, 0.08, 32]} />
              <meshStandardMaterial color="#0d1520" metalness={0.75} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.4, 0.46, 40]} />
              <meshBasicMaterial color="#228dff" transparent opacity={0.45} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
