import { Color, MeshStandardMaterial } from 'three';

export const STONE = new MeshStandardMaterial({ color: new Color('#1b2733'), roughness: 0.96, metalness: 0.02 });
export const DARK_STONE = new MeshStandardMaterial({ color: new Color('#121c26'), roughness: 0.98, metalness: 0.02 });

export const GLOW = {
  cyan: new Color('#3dd6f5'),
  blue: new Color('#228dff'),
  green: new Color('#2bd47d'),
  amber: new Color('#f5b53d'),
  pearl: new Color('#e9fbff'),
} as const;
