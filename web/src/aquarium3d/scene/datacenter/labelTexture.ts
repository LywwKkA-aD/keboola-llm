import { CanvasTexture, SRGBColorSpace } from 'three';

const cache = new Map<string, CanvasTexture>();

/** A small text texture drawn on a canvas (no font downloads, CSP-safe), cached per text and colour. */
export function labelTexture(text: string, color = '#cfe8ff', width = 256, height = 96): CanvasTexture {
  const key = `${text}|${color}|${width}x${height}`;
  const known = cache.get(key);
  if (known) return known;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = color;
    context.font = `600 ${Math.round(height * 0.42)}px "IBM Plex Mono", ui-monospace, monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, width / 2, height / 2 + 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}
