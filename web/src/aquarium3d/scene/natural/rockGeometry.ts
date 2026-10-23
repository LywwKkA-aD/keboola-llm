import { type BufferGeometry, IcosahedronGeometry } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rockOffset } from '../../nature.ts';

const cache = new Map<string, BufferGeometry>();

/**
 * A lumpy rock: an icosphere pushed in and out by a smooth seeded bump. `flatTop` (in unit space)
 * shaves the top flat, e.g. for the council rock the lead sits on. Cached per seed.
 */
export function rockGeometry(seed: number, detail = 3, flatTop?: number): BufferGeometry {
  const key = `${seed}:${detail}:${flatTop ?? ''}`;
  const known = cache.get(key);
  if (known) return known;

  const geometry = mergeVertices(new IcosahedronGeometry(1, detail));
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const scale = 1 + rockOffset([x, y, z], seed);
    const ny = flatTop === undefined ? y * scale : Math.min(y * scale, flatTop);
    position.setXYZ(i, x * scale, ny, z * scale);
  }
  geometry.computeVertexNormals();
  cache.set(key, geometry);
  return geometry;
}
