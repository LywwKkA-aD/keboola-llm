import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { Color, type MeshBasicMaterial } from 'three';
import { STATIONS_3D, stationSlots } from '../../layout3d.ts';
import { screenMaterial } from './screenMaterial.ts';

const FLOOR = -0.6;
const METAL = { color: '#0d1520', metalness: 0.75, roughness: 0.35 } as const;
const DESK_AHEAD = 1.5;
const BLUE = new Color('#228dff');

/** One Keboola workstation: a desk with three monitors and the agent's own floor pad in front of it. */
function Workstation({ index, slot, occupied, motion }: { index: number; slot: readonly number[]; occupied: boolean; motion: boolean }) {
  const { facing } = STATIONS_3D.console;
  const screens = useMemo(
    () => [screenMaterial('code', index * 3 + 1), screenMaterial('chart', index * 3 + 2), screenMaterial('code', index * 3 + 3)],
    [index],
  );
  const pad = useMemo(() => ({ material: null as MeshBasicMaterial | null }), []);

  useFrame(({ clock }) => {
    screens.forEach((material) => {
      material.uniforms.uTime!.value = motion ? clock.elapsedTime : 0;
      material.uniforms.uActive!.value += ((occupied ? 1 : 0) - material.uniforms.uActive!.value) * 0.08;
    });
    if (pad.material) pad.material.opacity = occupied ? 0.85 : 0.22;
  });

  const [x, , z] = slot;
  const deskX = (x ?? 0) + Math.sin(facing) * DESK_AHEAD;
  const deskZ = (z ?? 0) + Math.cos(facing) * DESK_AHEAD;
  return (
    <group>
      <mesh position={[x ?? 0, FLOOR + 0.02, z ?? 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.5, 40]} />
        <meshBasicMaterial
          ref={(material) => {
            pad.material = material;
          }}
          color={BLUE}
          transparent
          toneMapped={false}
        />
      </mesh>
      <group position={[deskX, FLOOR, deskZ]} rotation={[0, facing + Math.PI, 0]}>
        <mesh position={[0, 0.8, 0]}>
          <boxGeometry args={[1.6, 0.08, 0.7]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
        {[-0.62, 0.62].map((legX) => (
          <mesh key={legX} position={[legX, 0.4, 0]}>
            <boxGeometry args={[0.06, 0.8, 0.6]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
        ))}
        {[
          { x: 0, y: 1.55, w: 1.3, h: 0.74, turn: 0 },
          { x: -1.0, y: 1.45, w: 0.8, h: 0.5, turn: 0.35 },
          { x: 1.0, y: 1.45, w: 0.8, h: 0.5, turn: -0.35 },
        ].map((monitor, i) => (
          <group key={monitor.x} position={[monitor.x, monitor.y, -0.25]} rotation={[0, monitor.turn, 0]}>
            <mesh position={[0, -(monitor.y - 0.84) / 2, -0.04]}>
              <boxGeometry args={[0.05, monitor.y - 0.84, 0.05]} />
              <meshStandardMaterial {...METAL} />
            </mesh>
            <mesh position={[0, 0, -0.02]}>
              <boxGeometry args={[monitor.w + 0.06, monitor.h + 0.06, 0.03]} />
              <meshStandardMaterial {...METAL} />
            </mesh>
            {/* Screens face the agent at the pad (+z in the desk frame). */}
            <mesh material={screens[i]}>
              <planeGeometry args={[monitor.w, monitor.h]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** The Keboola station: a row of workstations, one place per agent so nobody stands on anybody. */
export function Workstations({ occupied, motion }: { occupied: number; motion: boolean }) {
  const slots = useMemo(() => stationSlots('console'), []);
  return (
    <group>
      {slots.map((slot, index) => (
        <Workstation key={index} index={index} slot={slot} occupied={index < occupied} motion={motion} />
      ))}
    </group>
  );
}
