import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, DodecahedronGeometry, type ShaderMaterial } from 'three';
import { WATER } from './Water.tsx';

/** Seabed with animated caustics, fading into the fog colour toward the horizon. */
function Floor({ motion }: { motion: boolean }) {
  const material = useRef<ShaderMaterial>(null);
  useFrame(({ clock }) => {
    if (material.current && motion) material.current.uniforms.uTime!.value = clock.elapsedTime;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
      <circleGeometry args={[42, 96]} />
      <shaderMaterial
        ref={material}
        uniforms={{
          uTime: { value: 0 },
          uBase: { value: new Color('#0a1a2a') },
          uLight: { value: new Color('#3f9bff') },
          uFog: { value: new Color(WATER.fog) },
        }}
        vertexShader={`
          varying vec2 vPos;
          void main() {
            vPos = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`}
        fragmentShader={`
          uniform float uTime;
          uniform vec3 uBase;
          uniform vec3 uLight;
          uniform vec3 uFog;
          varying vec2 vPos;
          float caustic(vec2 p, float t) {
            float c = 0.0;
            vec2 q = p * 0.55;
            for (int i = 0; i < 3; i++) {
              q += vec2(sin(q.y * 1.7 + t * 0.55), cos(q.x * 1.4 - t * 0.45));
              c += abs(sin(q.x + q.y));
            }
            return pow(1.0 - c / 3.0, 4.0);
          }
          void main() {
            float d = length(vPos);
            float c = caustic(vPos, uTime) + 0.5 * caustic(vPos * 1.9 + 7.0, uTime * 1.3);
            vec3 col = uBase + uLight * c * 0.14 * smoothstep(26.0, 4.0, d);
            gl_FragColor = vec4(mix(col, uFog, smoothstep(10.0, 34.0, d)), 1.0);
          }`}
      />
    </mesh>
  );
}

// Outside the ring of rest pods (radius ~10.5) so nothing grows through the team.
const ROCKS = [
  [-13, -8, 1.8], [-6, -14, 1.3], [4, -14.5, 1.6], [12.5, -9, 2], [-15, 2, 1.4], [15.5, 3, 1.5], [-11, 9.5, 1.1], [11.5, 10, 1.2],
] as const;

const KELP = [[-14, -4], [-10, -11], [-3, -14], [2, -15], [8.5, -12.5], [14, -5], [-15.5, 6], [15.5, 7.5], [-9, -13], [12, -11]] as const;

/** Kelp sways in the vertex shader; the base stays planted. */
function Kelp({ x, z, motion, seed }: { x: number; z: number; motion: boolean; seed: number }) {
  const material = useRef<ShaderMaterial>(null);
  useFrame(({ clock }) => {
    if (material.current && motion) material.current.uniforms.uTime!.value = clock.elapsedTime;
  });
  const height = 4 + (seed % 3);
  return (
    <mesh position={[x, -0.6 + height / 2, z]}>
      <cylinderGeometry args={[0.04, 0.14, height, 6, 16]} />
      <shaderMaterial
        ref={material}
        uniforms={{ uTime: { value: 0 }, uSeed: { value: seed }, uHeight: { value: height } }}
        vertexShader={`
          uniform float uTime;
          uniform float uSeed;
          uniform float uHeight;
          varying float vH;
          void main() {
            vec3 p = position;
            vH = (p.y / uHeight) + 0.5;
            p.x += sin(uTime * 0.8 + uSeed + vH * 3.0) * 0.45 * vH * vH;
            p.z += cos(uTime * 0.6 + uSeed) * 0.25 * vH * vH;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`}
        fragmentShader={`
          varying float vH;
          void main() {
            gl_FragColor = vec4(mix(vec3(0.02, 0.12, 0.12), vec3(0.08, 0.42, 0.38), vH), 1.0);
          }`}
      />
    </mesh>
  );
}

export function Seabed({ motion }: { motion: boolean }) {
  const rock = useMemo(() => new DodecahedronGeometry(1, 0), []);
  return (
    <group>
      <Floor motion={motion} />
      {ROCKS.map(([x, z, s], index) => (
        <mesh key={`${x}${z}`} geometry={rock} position={[x, -0.6 + s * 0.25, z]} scale={[s, s * 0.6, s * 0.9]} rotation={[0.2 * index, index, 0]}>
          <meshStandardMaterial color="#0d1d2e" roughness={0.95} metalness={0.05} flatShading />
        </mesh>
      ))}
      {KELP.map(([x, z], index) => (
        <Kelp key={`${x}${z}`} x={x} z={z} motion={motion} seed={index * 2.3} />
      ))}
    </group>
  );
}
