import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CatmullRomCurve3, Color, DoubleSide, type Group, LatheGeometry, type Mesh, type MeshBasicMaterial, MathUtils, SphereGeometry, TubeGeometry, Vector2, Vector3 } from 'three';
import type { AgentActivity } from '../../aquarium/state.ts';
import { dampAngle } from '../angles.ts';
import type { Spot } from '../layout3d.ts';
import { BRAND_BLUE, HEAD, headProfile, TENTACLES, tentaclePath } from '../mascot.ts';
import { auraFor } from '../status.ts';
import { Label } from './Label.tsx';
import { skinMaterial, tentacleMaterial, withAlongAttribute } from './tentacleMaterial.ts';

const headGeometry = new LatheGeometry(headProfile().map(([r, y]) => new Vector2(r, y)), 56);
const eyeGeometry = new SphereGeometry(0.085, 20, 16);
const capGeometry = new SphereGeometry(HEAD.tube, 12, 10);

/** Octopus size in scene units; the shape itself is modelled at ~1.2 units wide. */
export const OCTOPUS_SCALE = 0.55;

function useTentacles() {
  return useMemo(
    () =>
      TENTACLES.map((tentacle) => {
        const points = tentaclePath(tentacle).map(([x, y, z]) => new Vector3(x, y, z));
        const curve = new CatmullRomCurve3(points, false, 'centripetal');
        const geometry = withAlongAttribute(new TubeGeometry(curve, 40, HEAD.tube, 10, false));
        // Bend sideways to the tentacle's own direction so waves look like swimming, not shaking.
        const outward = new Vector3(Math.cos(tentacle.azimuth), 0, -Math.sin(tentacle.azimuth));
        const bend = new Vector3(0, 1, 0).cross(outward).add(outward.multiplyScalar(0.4));
        const { material, uniforms } = tentacleMaterial(BRAND_BLUE, tentacle.phase, bend);
        return { geometry, material, uniforms, tip: points.at(-1) ?? new Vector3() };
      }),
    [],
  );
}

export interface Octopus3DProps {
  readonly name: string;
  readonly caption: string;
  readonly mood: AgentActivity;
  readonly spot: Spot;
  readonly selected: boolean;
  readonly motion: boolean;
  readonly onSelect: (name: string) => void;
  /** Registers the live world position so links can follow swimming octopuses. */
  readonly track?: (name: string, position: Vector3) => void;
}

/** One agent as the Keboola octopus: same brand skin for all, state shown by the aura and motion. */
export function Octopus3D({ name, caption, mood, spot, selected, motion, onSelect, track }: Octopus3DProps) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const auraRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const tentacles = useTentacles();
  const skin = useMemo(() => skinMaterial(BRAND_BLUE), []);
  const seed = useMemo(() => [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 100, [name]);
  const aura = auraFor(mood);
  const auraColor = useMemo(() => new Color(aura.color), [aura.color]);

  useEffect(() => {
    if (root.current) root.current.position.set(...spot.position);
    // Only on mount: afterwards the octopus swims to new spots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);

  useFrame(({ clock }, delta) => {
    const group = root.current;
    if (!group) return;
    const t = motion ? clock.elapsedTime : 0;
    const dt = Math.min(delta, 0.05);
    const [tx, ty, tz] = spot.position;
    const before = group.position.clone();
    const lambda = motion ? 1.4 : 20;
    group.position.x = MathUtils.damp(group.position.x, tx, lambda, dt);
    group.position.z = MathUtils.damp(group.position.z, tz, lambda, dt);
    group.position.y = MathUtils.damp(group.position.y, ty, lambda, dt);
    const speed = before.distanceTo(group.position) / Math.max(dt, 1e-3);
    const swimming = speed > 0.4;

    const heading = swimming ? Math.atan2(tx - before.x, tz - before.z) : spot.facing;
    group.rotation.y = dampAngle(group.rotation.y, heading, 3, dt);
    if (body.current) {
      body.current.position.y = Math.sin(t * 0.9 + seed) * 0.09;
      body.current.rotation.x = MathUtils.damp(body.current.rotation.x, swimming ? 0.35 : 0, 3, dt);
      const breathe = 1 + Math.sin(t * (swimming ? 4 : 1.2) + seed) * (swimming ? 0.04 : 0.015);
      body.current.scale.set(1 / Math.sqrt(breathe), breathe, 1 / Math.sqrt(breathe));
    }
    tentacles.forEach(({ uniforms }) => {
      uniforms.uTime.value = t;
      uniforms.uSpeed.value = swimming ? 5 : aura.tentacleSpeed;
      uniforms.uAmp.value = swimming ? 0.16 : aura.tentacleAmp;
    });
    if (auraRef.current) {
      const pulse = aura.pulse > 0 && motion ? 0.65 + 0.35 * Math.sin((t * Math.PI * 2) / aura.pulse) : 1;
      const boost = selected ? 1.6 : hovered ? 1.3 : 1;
      (auraRef.current.material as MeshBasicMaterial).opacity = Math.min(1, 0.35 * aura.intensity * pulse * boost);
    }
    track?.(name, group.position);
  });

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(name);
  };

  return (
    <group ref={root} scale={OCTOPUS_SCALE}>
      <group
        ref={body}
        onClick={select}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <mesh geometry={headGeometry} material={skin} />
        {[-0.17, 0.17].map((x) => (
          <mesh key={x} geometry={eyeGeometry} position={[x, HEAD.bottom + 0.34, 0.44]} scale={[1, 1.15, 0.6]}>
            <meshStandardMaterial color="#ffffff" emissive="#dff1ff" emissiveIntensity={mood === 'idle' ? 0.4 : 1.4} />
          </mesh>
        ))}
        {tentacles.map(({ geometry, material, tip }, index) => (
          <group key={TENTACLES[index]?.azimuth}>
            <mesh geometry={geometry} material={material} />
            <mesh geometry={capGeometry} material={skin} position={tip} />
          </group>
        ))}
      </group>
      <mesh ref={auraRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.15, 0]}>
        <ringGeometry args={[0.55, selected ? 1.05 : 0.95, 48]} />
        <meshBasicMaterial color={auraColor} transparent opacity={0.3} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* Always mounted and hidden with CSS: unmounting drei Html during a render trips React 19. */}
      <Label position={[0, 2.3, 0]} center distanceFactor={15} zIndexRange={[20, 0]} pointerEvents="none">
        <div className={`octo-tag octo-tag--${mood}${selected ? ' octo-tag--selected' : ''}${mood === 'idle' && !selected && !hovered ? ' octo-tag--hidden' : ''}`}>
          <span className="octo-tag__name">{name.replace(/^kbc-/, '')}</span>
          {caption && <span className="octo-tag__caption">{caption}</span>}
        </div>
      </Label>
    </group>
  );
}
