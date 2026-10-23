import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { AdditiveBlending, Color, DoubleSide, type Group, type MeshBasicMaterial, type ShaderMaterial } from 'three';
import { labelTexture } from './labelTexture.ts';

const METAL = { color: '#0d1520', metalness: 0.75, roughness: 0.35 } as const;
const AMBER = new Color('#f5b53d');
const CYAN = new Color('#3dd6f5');
const GATE = { width: 1.9, height: 2.6 } as const;

/**
 * Approvals station: a security checkpoint. Idle, the light curtain in the arch is a faint cyan;
 * while an agent waits for the user it turns amber, scans, and an approval card floats in front.
 */
export function Checkpoint({ active, motion }: { active: boolean; motion: boolean }) {
  const curtain = useRef<ShaderMaterial>(null);
  const frame = useRef<MeshBasicMaterial>(null);
  const card = useRef<Group>(null);
  const cardEdge = useRef<MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const t = motion ? clock.elapsedTime : 0;
    if (curtain.current) {
      curtain.current.uniforms.uTime!.value = t;
      curtain.current.uniforms.uColor!.value.copy(active ? AMBER : CYAN);
      curtain.current.uniforms.uStrength!.value = active ? 1 : 0.25;
    }
    if (frame.current) frame.current.color.copy(active ? AMBER : CYAN).multiplyScalar(active ? 1.2 : 0.45);
    if (card.current) {
      card.current.visible = active;
      card.current.position.y = 3.2 + Math.sin(t * 1.6) * 0.06;
    }
    if (cardEdge.current) cardEdge.current.opacity = 0.55 + 0.45 * Math.sin(t * 4);
  });

  const half = GATE.width / 2;
  return (
    <group>
      {[-half, half].map((x) => (
        <mesh key={x} position={[x, GATE.height / 2, 0]}>
          <boxGeometry args={[0.18, GATE.height, 0.3]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      ))}
      <mesh position={[0, GATE.height + 0.09, 0]}>
        <boxGeometry args={[GATE.width + 0.18, 0.18, 0.3]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position={[0, GATE.height - 0.02, 0.16]}>
        <boxGeometry args={[GATE.width - 0.1, 0.04, 0.02]} />
        <meshBasicMaterial ref={frame} toneMapped={false} />
      </mesh>
      <mesh position={[0, GATE.height / 2, 0]}>
        <planeGeometry args={[GATE.width - 0.18, GATE.height - 0.1]} />
        <shaderMaterial
          ref={curtain}
          transparent
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
          uniforms={{ uTime: { value: 0 }, uColor: { value: CYAN.clone() }, uStrength: { value: 0.25 } }}
          vertexShader={`
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`}
          fragmentShader={`
            uniform float uTime;
            uniform vec3 uColor;
            uniform float uStrength;
            varying vec2 vUv;
            void main() {
              float lines = 0.5 + 0.5 * sin(vUv.y * 90.0);
              float scan = smoothstep(0.06, 0.0, abs(vUv.y - fract(uTime * 0.45)));
              float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
              float alpha = (0.05 + 0.06 * lines + 0.55 * scan) * edge * uStrength;
              gl_FragColor = vec4(uColor, alpha);
            }`}
        />
      </mesh>
      <group ref={card} position={[0, 3.2, 0.25]}>
        <mesh>
          <planeGeometry args={[1.1, 0.42]} />
          <meshBasicMaterial color="#2a1c05" transparent opacity={0.75} side={DoubleSide} />
        </mesh>
        <mesh position={[0, 0, 0.005]}>
          <planeGeometry args={[1.0, 0.3]} />
          <meshBasicMaterial map={labelTexture('APPROVAL ?', '#ffd37a', 320, 96)} transparent toneMapped={false} side={DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, -0.005]}>
          <planeGeometry args={[1.18, 0.5]} />
          <meshBasicMaterial ref={cardEdge} color={AMBER} transparent opacity={0.8} toneMapped={false} side={DoubleSide} />
        </mesh>
      </group>
      {active && <pointLight position={[0, 2.2, 0.6]} color={AMBER} intensity={5} distance={6} />}
    </group>
  );
}
