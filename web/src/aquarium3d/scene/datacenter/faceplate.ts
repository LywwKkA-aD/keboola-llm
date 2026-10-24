import { CanvasTexture, SRGBColorSpace } from 'three';
import { seeded } from '../../nature.ts';

/**
 * The front of a filled rack: servers of 1U to 4U with vent slots and handles, drawn once on a small canvas and
 * shared by every rack. Deterministic, so the hall looks the same on every load.
 */
export function faceplateTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g) {
    const random = seeded(7);
    g.fillStyle = '#0a1018';
    g.fillRect(0, 0, 64, 256);
    for (let y = 6; y < 250; ) {
      const height = ([1, 1, 2, 2, 4][Math.floor(random() * 5)] ?? 1) * 6;
      g.fillStyle = random() > 0.5 ? '#172332' : '#121c29';
      g.fillRect(4, y, 56, height - 1);
      g.fillStyle = '#0b1119';
      for (let x = 18; x < 56; x += 4) g.fillRect(x, y + 2, 2, Math.max(1, height - 5));
      g.fillStyle = '#2b3d56';
      g.fillRect(6, y + 1, 2, height - 3);
      y += height;
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
