import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import type { SceneQuality } from '../AquariumView.tsx';

/** Bloom makes holograms and auras glow; low quality renders without post-processing. */
export function Effects({ quality }: { quality: SceneQuality }) {
  if (quality === 'low') return null;
  return (
    <EffectComposer multisampling={quality === 'high' ? 4 : 0}>
      <Bloom mipmapBlur intensity={quality === 'high' ? 1.1 : 0.8} luminanceThreshold={0.55} luminanceSmoothing={0.2} />
      <Vignette eskil={false} offset={0.25} darkness={quality === 'high' ? 0.75 : 0.6} />
    </EffectComposer>
  );
}
