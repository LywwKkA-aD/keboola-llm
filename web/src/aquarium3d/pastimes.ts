import { AGENT_Y, type Pastime, RACK, RACK_ROWS, ROW_Z, type Spot, STATION_SPOTS } from './floorplan.ts';
import type { Vec3 } from './mascot.ts';

/**
 * What resting agents do instead of standing in an empty aisle: look at a rack up close, gather in small groups on
 * the operations floor and talk, or stroll slowly up and down an aisle. Pure: the same names and time give the same
 * picture, so every render agrees and tests can pin it.
 */

/** How long one pastime lasts. Every agent's clock is offset by its name, so they change one at a time. */
export const SHIFT_MS = 75_000;
/** A stroller turns at an end of its path this often: about eight seconds of walking, then a look around. */
const LEG_MS = 12_000;
/** Strolling pace (scene units per second); errands walk at 2.6. */
const STROLL_PACE = 0.8;
/** Out of 100: below CHAT talks, below INSPECT looks at a rack, the rest strolls. */
const CHAT = 40;
const INSPECT = 75;
const MAX_GROUP = 4;
/** Distance from a rack face to the agent looking at it. */
const FACE_GAP = 0.62;

const at = (x: number, z: number): Vec3 => [x, AGENT_Y, z];

/** Racks to look at, counted from the back of a row: the front ones first (in view of the camera). */
const RACK_INDEXES = [9, 7, 5, 8, 6, 4];
/** How many of the inspect places are preferred; the rest take whoever does not fit. */
const PREFERRED_INSPECT = 3 * RACK_ROWS.length;

/** In front of a rack face in a cold aisle, looking at it. */
export const INSPECT_SPOTS: readonly Spot[] = RACK_INDEXES.flatMap((index) =>
  RACK_ROWS.map((row) => {
    const x = row.x + row.front * (RACK.depth / 2 + FACE_GAP);
    return { position: at(x, ROW_Z.back + RACK.width / 2 + index * RACK.width), facing: (-row.front * Math.PI) / 2 };
  }),
);

/** Open floor on both sides of the lead's dais where small groups gather, clear of the corridors and stations. */
export const MEETING_POINTS: readonly Vec3[] = [at(-4.4, 1.6), at(4.4, 1.6)];

/** Up and down the two hot aisles and along the front of the operations floor; one stroller per path. */
export const STROLL_PATHS: readonly (readonly [Vec3, Vec3])[] = [
  [at(-3.3, -3.0), at(-3.3, -9.0)],
  [at(3.3, -3.0), at(3.3, -9.0)],
  [at(-5.6, 4.4), at(5.6, 4.4)],
];

const COMMAND = STATION_SPOTS.command[0] ?? at(0, 1.8);
/** Around the lead's dais, beside and behind the lead so the camera still sees it; degrees from its front. */
const BRIEFING_ANGLES = [90, -90, 130, -130, 50, -50];
const BRIEFING_RADIUS = 2.2;

const facingTo = (from: Vec3, to: Vec3) => Math.atan2(to[0] - from[0], to[2] - from[2]);
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** Where the n-th agent that just got a task stands: at the lead's dais, facing the lead. */
export function briefingSpot(index: number): Spot {
  const angle = ((BRIEFING_ANGLES[index % BRIEFING_ANGLES.length] ?? 90) * Math.PI) / 180;
  const radius = BRIEFING_RADIUS + Math.floor(index / BRIEFING_ANGLES.length);
  const position = at(COMMAND[0] + Math.sin(angle) * radius, COMMAND[2] + Math.cos(angle) * radius);
  return { position, facing: facingTo(position, COMMAND) };
}

export const BRIEFING_SPOTS: readonly Spot[] = BRIEFING_ANGLES.map((_, index) => briefingSpot(index));

/** FNV-1a: a stable 32-bit number for a string. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 0x01000193);
  return value >>> 0;
}

type Wish = { readonly kind: 'chat'; readonly point: number } | { readonly kind: 'inspect'; readonly spot: number } | { readonly kind: 'stroll'; readonly path: number };

function wishOf(name: string, now: number): Wish {
  const shift = Math.floor((now + (hash(name) % SHIFT_MS)) / SHIFT_MS);
  const roll = hash(`${name}:${shift}`);
  const pick = roll % 100;
  const choice = roll >>> 8;
  if (pick < CHAT) return { kind: 'chat', point: choice % MEETING_POINTS.length };
  if (pick < INSPECT) return { kind: 'inspect', spot: choice % PREFERRED_INSPECT };
  return { kind: 'stroll', path: choice % STROLL_PATHS.length };
}

function groupSpots(point: Vec3, members: number, turn: number): Spot[] {
  // Wide enough that raised arms do not cross: about 1.25 between neighbours.
  const radius = Math.max(0.7, 0.62 / Math.sin(Math.PI / Math.max(members, 2)));
  return Array.from({ length: members }, (_, i) => {
    const angle = turn + (2 * Math.PI * i) / members;
    const position = at(point[0] + Math.sin(angle) * radius, point[2] + Math.cos(angle) * radius);
    return { position, facing: facingTo(position, point) };
  });
}

/** What each resting agent does now and where it stands for it. */
export function pastimes(names: readonly string[], now: number): Record<string, Spot> {
  const wishes = names.map((name) => ({ name, wish: wishOf(name, now) }));
  const plans = new Map<string, Spot>();
  const inspectors: { name: string; spot: number }[] = [];

  // Groups of two to four at each meeting point. Someone alone at a point joins the nearest group with room, or
  // pairs with the next one alone; nobody talks to themselves.
  const groups = MEETING_POINTS.map((_, index) => wishes.filter(({ wish }) => wish.kind === 'chat' && wish.point === index).map(({ name }) => name).slice(0, MAX_GROUP));
  const alone = groups.flatMap((group, index) => (group.length === 1 ? [{ name: group[0] as string, index }] : []));
  alone.forEach(({ index }) => groups.splice(index, 1, []));
  alone.forEach(({ name, index }) => {
    const home = MEETING_POINTS[index] as Vec3;
    const byDistance = groups.map((group, i) => ({ group, i })).toSorted((a, b) => distance(MEETING_POINTS[a.i] as Vec3, home) - distance(MEETING_POINTS[b.i] as Vec3, home));
    const joined = byDistance.find(({ group }) => group.length >= 1 && group.length < MAX_GROUP) ?? byDistance.find(({ group }) => group.length === 0);
    joined?.group.push(name);
  });
  groups.forEach((members, index) => {
    if (members.length < 2) return;
    groupSpots(MEETING_POINTS[index] as Vec3, members.length, (hash(`turn:${index}`) % 360) * (Math.PI / 180)).forEach((spot, i) =>
      plans.set(members[i] as string, { ...spot, pastime: 'chat' }),
    );
  });

  // One stroller per path, turning at its ends.
  const walked = new Set<number>();
  wishes.forEach(({ name, wish }) => {
    if (wish.kind !== 'stroll' || walked.has(wish.path)) return;
    walked.add(wish.path);
    const [a, b] = STROLL_PATHS[wish.path] as readonly [Vec3, Vec3];
    const leg = Math.floor((now + (hash(`${name}:walk`) % LEG_MS)) / LEG_MS) % 2;
    const [here, there] = leg === 0 ? [a, b] : [b, a];
    plans.set(name, { position: here, facing: facingTo(here, there), pace: STROLL_PACE, pastime: 'stroll' });
  });

  // Everyone else looks at a rack: their own pick, or the next free one.
  wishes.forEach(({ name, wish }) => {
    if (plans.has(name)) return;
    inspectors.push({ name, spot: wish.kind === 'inspect' ? wish.spot : hash(name) % PREFERRED_INSPECT });
  });
  const taken = new Set<number>();
  inspectors.forEach(({ name, spot }) => {
    const free = Array.from({ length: INSPECT_SPOTS.length }, (_, step) => (spot + step) % INSPECT_SPOTS.length).find((index) => !taken.has(index));
    if (free === undefined) return;
    taken.add(free);
    plans.set(name, { ...(INSPECT_SPOTS[free] as Spot), pastime: 'inspect' });
  });

  return Object.fromEntries(names.flatMap((name) => (plans.has(name) ? [[name, plans.get(name) as Spot]] : [])));
}
