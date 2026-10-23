import { Color, Float32BufferAttribute, type BufferGeometry, MeshPhysicalMaterial, Vector3 } from 'three';

export interface BendUniforms {
  readonly uTime: { value: number };
  readonly uSpeed: { value: number };
  readonly uAmp: { value: number };
  readonly uPhase: { value: number };
  readonly uBend: { value: Vector3 };
}

/** Copy the along-the-tube coordinate (uv.x of a TubeGeometry) into `aT` for the bend shader. */
export function withAlongAttribute(geometry: BufferGeometry): BufferGeometry {
  const uv = geometry.getAttribute('uv');
  const along = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i += 1) along[i] = uv.getX(i);
  geometry.setAttribute('aT', new Float32BufferAttribute(along, 1));
  return geometry;
}

type Shader = Parameters<MeshPhysicalMaterial['onBeforeCompile']>[0];

/** Bioluminescent rim: a fresnel glow along the silhouette, strongest where the skin turns away from the camera. */
function addRimGlow(shader: Shader): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
float rim = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.0);
totalEmissiveRadiance += vec3(0.25, 0.65, 1.0) * rim * 0.85;`,
  );
}

/** Glossy brand-blue skin with a glowing rim; the same look for the head and the tentacles. */
export function skinMaterial(color: string): MeshPhysicalMaterial {
  const material = createSkin(color);
  material.onBeforeCompile = addRimGlow;
  material.customProgramCacheKey = () => 'keboola-skin-rim';
  return material;
}

function createSkin(color: string): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: new Color(color),
    roughness: 0.32,
    metalness: 0.05,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    sheen: 0.4,
    sheenColor: new Color('#9fd0ff'),
    emissive: new Color(color),
    emissiveIntensity: 0.12,
  });
}

/**
 * Skin that bends a tentacle in the vertex shader: the tip (aT = 1) waves most, the root stays put.
 * Cheap enough for dozens of octopuses; normals are left as is, which reads fine at this scale.
 */
export function tentacleMaterial(color: string, phase: number, bend: Vector3): { material: MeshPhysicalMaterial; uniforms: BendUniforms } {
  const uniforms: BendUniforms = {
    uTime: { value: 0 },
    uSpeed: { value: 1 },
    uAmp: { value: 0.08 },
    uPhase: { value: phase },
    uBend: { value: bend.clone().normalize() },
  };
  const material = createSkin(color);
  material.onBeforeCompile = (shader) => {
    addRimGlow(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aT;
uniform float uTime;
uniform float uSpeed;
uniform float uAmp;
uniform float uPhase;
uniform vec3 uBend;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
float tipWeight = aT * aT;
float wave = sin(uTime * uSpeed + aT * 3.6 + uPhase);
transformed += uBend * wave * uAmp * tipWeight * 5.0;
transformed.y += cos(uTime * uSpeed * 0.7 + aT * 2.2 + uPhase) * uAmp * tipWeight * 1.6;`,
      );
  };
  material.customProgramCacheKey = () => 'keboola-tentacle-bend';
  return { material, uniforms };
}
