import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, type InstancedMesh, Object3D, type ShaderMaterial } from 'three';
import { hallRacks, rackLeds } from '../../hall.ts';
import { seeded } from '../../nature.ts';

export const HALL = { background: '#04070c', fogNear: 20, fogFar: 46 } as const;

const LED_COLORS = { blue: new Color('#3d9bff'), green: new Color('#2bd47d'), amber: new Color('#f5b53d') } as const;
const rackBox = new BoxGeometry(0.92, 1, 1.0);
const stripBox = new BoxGeometry(0.03, 1, 0.02);
const ledBox = new BoxGeometry(0.1, 0.05, 0.015);

/** Raised-floor tiles: a faint grid that glows a little toward the centre and fades into the dark. */
function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
      <circleGeometry args={[44, 96]} />
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
            vec2 cell = abs(fract(vPos / 1.2 + 0.5) - 0.5) / fwidth(vPos / 1.2);
            float line = 1.0 - min(min(cell.x, cell.y), 1.0);
            float d = length(vPos);
            float glow = smoothstep(14.0, 0.0, d) * 0.05;
            vec3 col = uBase + uLine * (line * 0.2 + glow);
            gl_FragColor = vec4(mix(col, uFog, smoothstep(14.0, 38.0, d)), 1.0);
          }`}
        extensions={{ derivatives: true } as never}
      />
    </mesh>
  );
}

/** Two arcs of server racks with a blue edge strip and blinking status LEDs. */
function Racks({ motion }: { motion: boolean }) {
  const racks = useMemo(() => hallRacks(), []);
  const leds = useMemo(() => rackLeds(racks, 8), [racks]);
  const bodies = useRef<InstancedMesh>(null);
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
      dummy.translateZ(0.505);
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
    [bodies, strips, lights].forEach((mesh) => {
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
      positions[i * 3] = (random() - 0.5) * 34;
      positions[i * 3 + 1] = random() * 8 - 0.5;
      positions[i * 3 + 2] = (random() - 0.5) * 28;
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

/** The data-centre hall around the team: floor, racks, ceiling and air. */
export function Hall({ particles, motion }: { particles: number; motion: boolean }) {
  return (
    <>
      <color attach="background" args={[HALL.background]} />
      <fog attach="fog" args={[HALL.background, HALL.fogNear, HALL.fogFar]} />
      <Floor />
      <Racks motion={motion} />
      {particles > 0 && <Dust count={particles} motion={motion} />}
    </>
  );
}
