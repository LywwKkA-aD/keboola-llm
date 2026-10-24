import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CatmullRomCurve3, Color, DoubleSide, type Group, LatheGeometry, type Mesh, type MeshBasicMaterial, MathUtils, SphereGeometry, TubeGeometry, Vector2, Vector3 } from 'three';
import type { AgentActivity } from '../../aquarium/state.ts';
import { dampAngle } from '../angles.ts';
import { route } from '../floorplan.ts';
import type { Spot } from '../layout3d.ts';
import { BRAND_BLUE, HEAD, headProfile, HUB, TENTACLES, tentaclePath, tipOffset, type Vec3 } from '../mascot.ts';
import { auraFor } from '../status.ts';
import { Label } from './Label.tsx';
import { skinMaterial, tentacleMaterial, withAlongAttribute } from './tentacleMaterial.ts';

/** Walking pace along the aisles (scene units per second). */
const WALK_SPEED = 2.6;

const headGeometry = new LatheGeometry(headProfile().map(([r, y]) => new Vector2(r, y)), 56);
const eyeGeometry = new SphereGeometry(0.085, 20, 16);
const capGeometry = new SphereGeometry(HEAD.tube, 12, 10);
const hubGeometry = new SphereGeometry(HUB.radius, 32, 20);

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
        return { geometry, material, uniforms, phase: tentacle.phase, tip: points.at(-1) ?? new Vector3() };
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
    // Only on mount: afterwards the octopus walks to new spots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The way to the current spot along the aisles; recomputed whenever the spot changes.
  const walk = useRef<{ key: string; points: Vector3[]; next: number; speed: number }>({ key: '', points: [], next: 0, speed: 0 });
  // Tip caps follow the bend shader, so the ends of the tentacles stay closed while they wave.
  const caps = useRef<(Mesh | null)[]>([]);

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
    const key = spot.position.join(',');
    const way = walk.current;
    if (way.key !== key) {
      const from: Vec3 = [group.position.x, spot.position[1], group.position.z];
      way.key = key;
      way.points = route(from, spot.position).slice(1).map((point) => new Vector3(...point));
      way.next = 0;
    }
    if (!motion) {
      group.position.set(...spot.position);
      way.next = way.points.length;
    }
    const target = way.points[way.next];
    // Ease into a walking pace and out of it at the last point; corners keep the pace.
    const remaining = target ? group.position.distanceTo(target) + way.points.slice(way.next + 1).reduce((sum, p, i) => sum + p.distanceTo(way.points[way.next + i] as Vector3), 0) : 0;
    const pace = target ? Math.min(spot.pace ?? WALK_SPEED, 0.6 + remaining * 1.4) : 0;
    way.speed = MathUtils.damp(way.speed, pace, 4, dt);
    // At rest, a pastime adds a little life: scanning a rack, turning to whoever speaks in a group.
    const pastime = !target && mood === 'idle' ? spot.pastime : undefined;
    const glance = pastime === 'inspect' ? Math.sin(t * 0.21 + seed) * 0.28 : pastime === 'chat' ? Math.sin(t * 0.37 + seed) * 0.22 : 0;
    const heading = target ? Math.atan2(target.x - group.position.x, target.z - group.position.z) : spot.facing + glance;
    if (target) {
      const step = way.speed * dt;
      const gap = group.position.distanceTo(target);
      if (gap <= Math.max(step, 0.02)) {
        group.position.copy(target);
        way.next += 1;
      } else {
        group.position.addScaledVector(target.clone().sub(group.position).normalize(), step);
      }
    }
    const swimming = way.speed > 0.4;
    // 0 standing, 1 at full errand pace: a stroll leans and paddles only a little.
    const stride = MathUtils.clamp(way.speed / WALK_SPEED, 0, 1);
    group.rotation.y = dampAngle(group.rotation.y, heading, swimming ? 6 : 2, dt);
    if (body.current) {
      // Speaking in a group: quick small nods while it is this one's turn.
      const speaking = pastime === 'chat' && Math.sin(t * 0.9 + seed * 1.7) > 0.25;
      body.current.position.y = Math.sin(t * 0.9 + seed) * 0.09 + (speaking ? Math.sin(t * 7 + seed) * 0.035 : 0);
      // Looking a rack up and down; leaning into a walk.
      const look = pastime === 'inspect' ? -0.08 + Math.sin(t * 0.33 + seed) * 0.12 : 0;
      body.current.rotation.x = MathUtils.damp(body.current.rotation.x, swimming ? 0.35 * stride : look, 3, dt);
      body.current.rotation.z = MathUtils.damp(body.current.rotation.z, speaking ? Math.sin(t * 1.3 + seed) * 0.07 : 0, 3, dt);
      const breathe = 1 + Math.sin(t * (swimming ? 4 : 1.2) + seed) * (swimming ? 0.04 : 0.015);
      body.current.scale.set(1 / Math.sqrt(breathe), breathe, 1 / Math.sqrt(breathe));
    }
    const speed = MathUtils.lerp(aura.tentacleSpeed, 5, swimming ? stride : 0);
    const amp = MathUtils.lerp(aura.tentacleAmp, 0.16, swimming ? stride : 0);
    tentacles.forEach(({ uniforms, tip, phase }, index) => {
      uniforms.uTime.value = t;
      uniforms.uSpeed.value = speed;
      uniforms.uAmp.value = amp;
      const { x, y, z } = uniforms.uBend.value;
      const [dx, dy, dz] = tipOffset({ t, speed, amp, phase, bend: [x, y, z] });
      caps.current[index]?.position.set(tip.x + dx, tip.y + dy, tip.z + dz);
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
        <mesh geometry={hubGeometry} material={skin} position={[0, HUB.y, 0]} scale={[1, HUB.squash, 1]} />
        {[-0.17, 0.17].map((x) => (
          <mesh key={x} geometry={eyeGeometry} position={[x, HEAD.bottom + 0.34, 0.44]} scale={[1, 1.15, 0.6]}>
            <meshStandardMaterial color="#ffffff" emissive="#dff1ff" emissiveIntensity={mood === 'idle' ? 0.4 : 1.4} />
          </mesh>
        ))}
        {tentacles.map(({ geometry, material, tip }, index) => (
          <group key={TENTACLES[index]?.azimuth}>
            <mesh geometry={geometry} material={material} />
            <mesh
              ref={(node) => {
                caps.current[index] = node;
              }}
              geometry={capGeometry}
              material={skin}
              position={tip}
            />
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
