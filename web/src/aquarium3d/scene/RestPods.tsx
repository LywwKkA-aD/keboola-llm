import { reefSpot } from '../layout3d.ts';
import { STONE } from './natural/materials.ts';
import { rockGeometry } from './natural/rockGeometry.ts';

/** Flat stones on the far arc where resting octopuses hover, each with a faint ring of glowing moss. */
export function RestPods({ count }: { count: number }) {
  return (
    <group>
      {Array.from({ length: count }, (_, index) => {
        const { position } = reefSpot(index);
        return (
          <group key={index} position={[position[0], -0.6, position[2]]}>
            <mesh geometry={rockGeometry(100 + index, 2, 0.3)} material={STONE} scale={[0.62, 0.32, 0.55]} rotation={[0, index * 1.3, 0]} />
            <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.5, 0.56, 40]} />
              <meshBasicMaterial color="#2bd4a8" transparent opacity={0.18} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
