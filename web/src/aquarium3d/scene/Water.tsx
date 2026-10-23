import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, type ShaderMaterial } from 'three';

export const WATER = { background: '#020a14', fog: '#041627', fogDensity: 0.038 } as const;

const SNOW_BOX = { x: 36, y: 14, z: 30 } as const;

/** Marine snow: slow drifting particles; the shader wraps them vertically so nothing is allocated per frame. */
function MarineSnow({ count, motion }: { count: number; motion: boolean }) {
  const material = useRef<ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * SNOW_BOX.x;
      positions[i * 3 + 1] = Math.random() * SNOW_BOX.y - 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * SNOW_BOX.z;
      seeds[i] = Math.random();
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
        uniforms={{ uTime: { value: 0 }, uHeight: { value: SNOW_BOX.y }, uColor: { value: new Color('#8fc7ff') } }}
        vertexShader={`
          attribute float aSeed;
          uniform float uTime;
          uniform float uHeight;
          varying float vAlpha;
          void main() {
            vec3 p = position;
            p.y = mod(p.y - uTime * (0.08 + aSeed * 0.12) + 1.0, uHeight) - 1.0;
            p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.25;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (1.5 + aSeed * 2.5) * (14.0 / -mv.z);
            vAlpha = 0.25 + aSeed * 0.45;
            gl_Position = projectionMatrix * mv;
          }`}
        fragmentShader={`
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            gl_FragColor = vec4(uColor, vAlpha * smoothstep(0.5, 0.0, d));
          }`}
      />
    </points>
  );
}

/** Deep-water mood: background, exponential fog and drifting particles. */
export function Water({ particles, motion }: { particles: number; motion: boolean }) {
  return (
    <>
      <color attach="background" args={[WATER.background]} />
      <fogExp2 attach="fog" args={[WATER.fog, WATER.fogDensity]} />
      {particles > 0 && <MarineSnow count={particles} motion={motion} />}
    </>
  );
}
