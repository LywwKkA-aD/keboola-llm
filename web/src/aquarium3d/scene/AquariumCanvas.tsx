import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useCallback, useMemo, useState } from 'react';
import { ACESFilmicToneMapping, Vector3 } from 'three';
import type { AquariumViewProps, SceneQuality } from '../AquariumView.tsx';
import { buildSceneModel } from '../sceneModel.ts';
import { CameraRig, OVERVIEW } from './CameraRig.tsx';
import { Effects } from './Effects.tsx';
import { Links } from './Links.tsx';
import { Octopus3D } from './Octopus3D.tsx';
import { Docks } from './datacenter/Docks.tsx';
import { Hall } from './datacenter/Hall.tsx';
import { Stations } from './datacenter/Stations.tsx';
import { Sparks } from './Sparks.tsx';

const PARTICLES: Record<SceneQuality, number> = { high: 900, medium: 500, low: 0 };
const MAX_DPR: Record<SceneQuality, number> = { high: 2, medium: 1.5, low: 1 };

function Lights() {
  return (
    <>
      <ambientLight intensity={0.35} color="#6fa8ff" />
      <hemisphereLight args={['#7fc8ff', '#02060c', 0.75]} />
      <directionalLight position={[4, 14, 6]} intensity={1.7} color="#d6ecff" />
      <directionalLight position={[-6, 5, -9]} intensity={0.7} color="#5aa8ff" />
      {/* Reflections for the glossy skin, generated locally (no HDR download). */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#9fd4ff" position={[0, 6, 4]} scale={[12, 4, 1]} />
        <Lightformer form="ring" intensity={1.4} color="#228dff" position={[-6, 3, -4]} scale={4} />
        <Lightformer form="rect" intensity={0.8} color="#3dd6f5" position={[6, 2, -6]} scale={[6, 3, 1]} />
      </Environment>
    </>
  );
}

/** The 3D aquarium scene. Loaded lazily by AquariumView: three.js is heavy. */
export default function AquariumCanvas({ agents, lead, state, now, selected, onSelect, quality, reducedMotion = false }: AquariumViewProps) {
  const motion = !reducedMotion;
  const model = useMemo(() => buildSceneModel({ agents, lead, state, now }), [agents, lead, state, now]);
  const [positions] = useState(() => new Map<string, Vector3>());
  const [dpr, setDpr] = useState(Math.min(1.5, MAX_DPR[quality]));

  const track = useCallback(
    (name: string, position: Vector3) => {
      const known = positions.get(name);
      if (known) known.copy(position);
      else positions.set(name, position.clone());
    },
    [positions],
  );

  return (
    <Canvas
      dpr={dpr}
      gl={{ antialias: quality === 'low', powerPreference: 'high-performance' }}
      camera={{ fov: 45, position: [...OVERVIEW.position], near: 0.1, far: 160 }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      onPointerMissed={() => onSelect?.(undefined)}
    >
      <PerformanceMonitor
        onIncline={() => setDpr((current) => Math.min(MAX_DPR[quality], current + 0.25))}
        onDecline={() => setDpr((current) => Math.max(1, current - 0.25))}
      />
      <Hall particles={PARTICLES[quality]} motion={motion} />
      <Lights />
      <Stations active={model.stations} motion={motion} />
      <Docks count={Math.max(0, agents.length - 1)} />
      {agents.map((agent) => {
        const spot = model.spots[agent.name];
        if (!spot) return null;
        return (
          <Octopus3D
            key={agent.name}
            name={agent.name}
            caption={model.captions[agent.name] ?? ''}
            mood={model.moods[agent.name] ?? 'idle'}
            spot={spot}
            selected={selected === agent.name}
            motion={motion}
            onSelect={(name) => onSelect?.(name)}
            track={track}
          />
        );
      })}
      <Links lead={lead} targets={model.links} positions={positions} />
      <Sparks busy={agents.map((agent) => agent.name).filter((name) => (model.moods[name] ?? 'idle') !== 'idle')} positions={positions} motion={motion} />
      <CameraRig selected={selected} positions={positions} motion={motion} />
      <Effects quality={quality} />
    </Canvas>
  );
}
