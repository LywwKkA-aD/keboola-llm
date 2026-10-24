import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, type InstancedMesh, Object3D, type ShaderMaterial } from 'three';
import { FLOOR_Y, RACK, RACK_ROWS, rackPlacements, ROW_Z } from '../../floorplan.ts';
import { rackLeds } from '../../hall.ts';
import { seeded } from '../../nature.ts';
import { faceplateTexture } from './faceplate.ts';

export const HALL = { background: '#04070c', fogNear: 55, fogFar: 110 } as const;

/** The hall's walls: open toward the camera (+z), closed at the back and on both sides. */
const WALLS = { back: -14, left: -12.9, right: 12.9, front: 5.5, height: 4.2 } as const;
/** Cold aisles (rack fronts face each other there): lit from above, with perforated floor tiles. */
const COLD_AISLES = [-6.7, 0, 6.7] as const;

const LED_COLORS = { blue: new Color('#3d9bff'), green: new Color('#2bd47d'), amber: new Color('#f5b53d') } as const;
const rackBox = new BoxGeometry(0.92, 1, 1.0);
const stripBox = new BoxGeometry(0.03, 1, 0.02);
const ledBox = new BoxGeometry(0.1, 0.05, 0.015);
const faceBox = new BoxGeometry(0.84, 1, 0.004);
/** Ceiling fixtures over each cold aisle: short panels, not one long tube. */
const FIXTURE = { length: 0.9, gap: 1.84, y: 3.25 } as const;

/** Raised-floor tiles: a faint grid over the hall that fades into the dark beyond its walls. */
function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, -4]}>
      <planeGeometry args={[60, 60]} />
      <shaderMaterial
        uniforms={{ uBase: { value: new Color('#070c13') }, uLine: { value: new Color('#1d4e86') }, uFog: { value: new Color(HALL.background) } }}
        vertexShader={`
          varying vec2 vPos;
          void main() {
            vPos = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`}
        fragmentShader={`
          uniform vec3 uBase;
          uniform vec3 uLine;
          uniform vec3 uFog;
          varying vec2 vPos;
          void main() {
            // Plane coordinates: x across the hall, y = -(z + 4) along it.
            vec2 cell = abs(fract(vPos / 0.6 + 0.5) - 0.5) / fwidth(vPos / 0.6);
            float line = 1.0 - min(min(cell.x, cell.y), 1.0);
            vec2 inside = vec2(abs(vPos.x) - 12.9, abs(vPos.y + 0.75) - 9.25);
            float outside = length(max(inside, 0.0));
            vec3 col = uBase + uLine * line * 0.18;
            gl_FragColor = vec4(mix(col, uFog, smoothstep(0.0, 9.0, outside)), 1.0);
          }`}
        extensions={{ derivatives: true } as never}
      />
    </mesh>
  );
}

/** Dark wall panels with a thin blue base line: back and sides only, so the camera looks in from the front. */
function Walls() {
  const { back, left, right, front, height } = WALLS;
  const depth = front - back;
  const panels: { position: [number, number, number]; size: [number, number, number] }[] = [
    { position: [0, FLOOR_Y + height / 2, back], size: [right - left, height, 0.2] },
    { position: [left, FLOOR_Y + height / 2, back + depth / 2], size: [0.2, height, depth] },
    { position: [right, FLOOR_Y + height / 2, back + depth / 2], size: [0.2, height, depth] },
  ];
  return (
    <group>
      {panels.map(({ position, size }) => (
        <mesh key={position.join(',')} position={position}>
          <boxGeometry args={size} />
          <meshStandardMaterial color="#080d15" metalness={0.4} roughness={0.7} />
        </mesh>
      ))}
      {panels.map(({ position, size }) => (
        <mesh key={`base-${position.join(',')}`} position={[position[0], FLOOR_Y + 0.08, position[2]]}>
          <boxGeometry args={[size[0] + 0.02, 0.03, size[2] + 0.02]} />
          <meshBasicMaterial color="#1e6fd1" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Light bars over the cold aisles, perforated tiles below them, and cable trays above every row. */
function Overhead() {
  const length = ROW_Z.front - ROW_Z.back;
  const middle = (ROW_Z.front + ROW_Z.back) / 2;
  return (
    <group>
      {COLD_AISLES.map((x) => (
        <group key={x}>
          {Array.from({ length: Math.floor(length / FIXTURE.gap) }, (_, i) => (
            <mesh key={i} position={[x, FLOOR_Y + FIXTURE.y, ROW_Z.back + FIXTURE.gap * (i + 0.5)]}>
              <boxGeometry args={[0.16, 0.04, FIXTURE.length]} />
              <meshBasicMaterial color="#8fbfff" toneMapped={false} />
            </mesh>
          ))}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, FLOOR_Y + 0.005, middle]}>
            <planeGeometry args={[1.2, length]} />
            <meshBasicMaterial color="#123a66" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {RACK_ROWS.map((row) => (
        <mesh key={row.x} position={[row.x, FLOOR_Y + RACK.height + 0.55, middle]}>
          <boxGeometry args={[0.5, 0.08, length + 0.6]} />
          <meshStandardMaterial color="#111a26" metalness={0.6} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** Rows of server racks with a blue edge strip and blinking status LEDs on the aisle side. */
function Racks({ motion }: { motion: boolean }) {
  const racks = useMemo(() => rackPlacements(), []);
  const leds = useMemo(() => rackLeds(racks, 8), [racks]);
  const bodies = useRef<InstancedMesh>(null);
  const faces = useRef<InstancedMesh>(null);
  const faceplate = useMemo(() => faceplateTexture(), []);
  const strips = useRef<InstancedMesh>(null);
  const lights = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);

  useEffect(() => {
    racks.forEach((rack, i) => {
      dummy.position.set(rack.position[0], rack.position[1] + rack.height / 2, rack.position[2]);
      dummy.rotation.set(0, rack.rotation, 0);
      dummy.scale.set(1, rack.height, 1);
      dummy.updateMatrix();
      bodies.current?.setMatrixAt(i, dummy.matrix);
      dummy.translateZ(0.503);
      dummy.scale.set(1, rack.height * 0.94, 1);
      dummy.updateMatrix();
      faces.current?.setMatrixAt(i, dummy.matrix);
      dummy.translateZ(0.002);
      dummy.translateX(0.4);
      dummy.scale.set(1, rack.height * 0.92, 1);
      dummy.updateMatrix();
      strips.current?.setMatrixAt(i, dummy.matrix);
    });
    leds.forEach((led, i) => {
      dummy.position.set(...led.position);
      dummy.rotation.set(0, led.rotation, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      lights.current?.setMatrixAt(i, dummy.matrix);
      lights.current?.setColorAt(i, LED_COLORS[led.kind]);
    });
    [bodies, faces, strips, lights].forEach((mesh) => {
      if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
    });
  }, [racks, leds, dummy]);

  useFrame(({ clock }) => {
    const mesh = lights.current;
    if (!mesh) return;
    const t = motion ? clock.elapsedTime : 0;
    leds.forEach((led, i) => {
      const on = Math.sin(t * led.rate * 3 + led.phase) > -0.3 ? 1 : 0.15;
      mesh.setColorAt(i, color.copy(LED_COLORS[led.kind]).multiplyScalar(on * 2.4));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={bodies} args={[rackBox, undefined, racks.length]}>
        <meshStandardMaterial color="#0c121b" metalness={0.75} roughness={0.38} />
      </instancedMesh>
      <instancedMesh ref={faces} args={[faceBox, undefined, racks.length]}>
        <meshStandardMaterial map={faceplate} metalness={0.45} roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={strips} args={[stripBox, undefined, racks.length]}>
        <meshBasicMaterial color="#1e6fd1" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={lights} args={[ledBox, undefined, leds.length]}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** Fine dust drifting in the cold air of the hall. */
function Dust({ count, motion }: { count: number; motion: boolean }) {
  const material = useRef<ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const random = seeded(99);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (random() - 0.5) * 26;
      positions[i * 3 + 1] = random() * 4.5 - 0.5;
      positions[i * 3 + 2] = random() * 19 - 14;
      seeds[i] = random();
    }
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(positions, 3));
    result.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    return result;
  }, [count]);
  useFrame(({ clock }) => {
    if (material.current && motion) material.current.uniforms.uTime!.value = clock.elapsedTime;
  });
  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={`
          attribute float aSeed;
          uniform float uTime;
          varying float vAlpha;
          void main() {
            vec3 p = position;
            p.x += sin(uTime * 0.05 + aSeed * 50.0) * 0.6;
            p.y += sin(uTime * 0.08 + aSeed * 30.0) * 0.3;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (1.0 + aSeed * 1.6) * (14.0 / -mv.z);
            vAlpha = 0.12 + aSeed * 0.25;
            gl_Position = projectionMatrix * mv;
          }`}
        fragmentShader={`
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            gl_FragColor = vec4(0.6, 0.8, 1.0, vAlpha * smoothstep(0.5, 0.0, d));
          }`}
      />
    </points>
  );
}

/** The data-centre hall around the team: floor, walls, rows of racks, lights and air. */
export function Hall({ particles, motion }: { particles: number; motion: boolean }) {
  return (
    <>
      <color attach="background" args={[HALL.background]} />
      <fog attach="fog" args={[HALL.background, HALL.fogNear, HALL.fogFar]} />
      <Floor />
      <Walls />
      <Overhead />
      <Racks motion={motion} />
      {particles > 0 && <Dust count={particles} motion={motion} />}
    </>
  );
}
