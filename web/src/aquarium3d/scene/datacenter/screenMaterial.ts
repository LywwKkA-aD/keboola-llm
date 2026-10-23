import { Color, ShaderMaterial } from 'three';

export type ScreenKind = 'code' | 'chart';

/**
 * An abstract monitor picture, no text: "code" shows scrolling rows of blocks, "chart" shows moving bars.
 * uActive brightens and speeds it up while an agent sits at the desk.
 */
export function screenMaterial(kind: ScreenKind, seed: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uActive: { value: 0 },
      uSeed: { value: seed },
      uColor: { value: new Color('#3d9bff') },
      uAccent: { value: new Color('#2bd47d') },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uActive;
      uniform float uSeed;
      uniform vec3 uColor;
      uniform vec3 uAccent;
      varying vec2 vUv;
      float hash(float n) { return fract(sin(n * 91.345 + uSeed * 17.13) * 47453.5453); }
      void main() {
        vec3 base = vec3(0.012, 0.035, 0.07);
        float speed = mix(0.02, 0.35, uActive);
        float glow = mix(0.35, 1.0, uActive);
        vec3 col = base;
        ${kind === 'code'
          ? `
        float rows = 16.0;
        float y = vUv.y + uTime * speed;
        float row = floor(y * rows);
        float inRow = fract(y * rows);
        float indent = floor(hash(row) * 4.0) * 0.06;
        float len = 0.2 + hash(row + 7.0) * 0.6;
        float x = vUv.x - 0.06 - indent;
        float bar = step(0.0, x) * step(x, len) * step(0.3, inRow) * step(inRow, 0.7);
        float accent = step(0.82, hash(row + 3.0));
        col += mix(uColor, uAccent, accent) * bar * glow * 0.9;`
          : `
        float bars = 12.0;
        float column = floor(vUv.x * bars);
        float inColumn = fract(vUv.x * bars);
        float h = 0.15 + 0.7 * fract(hash(column) + uTime * speed * 0.6 * (0.5 + hash(column + 5.0)));
        float bar = step(0.15, inColumn) * step(inColumn, 0.85) * step(vUv.y, h);
        float line = smoothstep(0.012, 0.0, abs(vUv.y - (0.55 + 0.25 * sin(vUv.x * 9.0 + uTime * speed * 6.0 + uSeed))));
        col += uColor * bar * glow * 0.7 + uAccent * line * glow;`}
        float frame = step(0.02, vUv.x) * step(vUv.x, 0.98) * step(0.03, vUv.y) * step(vUv.y, 0.97);
        gl_FragColor = vec4(col * frame + uColor * (1.0 - frame) * 0.4 * glow, 1.0);
      }`,
    toneMapped: false,
  });
}
