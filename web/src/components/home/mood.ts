import type { AgentActivity } from '../../aquarium/state.ts';

/** Status dot class for an agent's current activity. */
export function moodDot(mood: AgentActivity): string {
  switch (mood) {
    case 'idle':
      return 'dot';
    case 'waiting':
      return 'dot dot--amber dot--pulse';
    case 'error':
      return 'dot dot--red';
    case 'thinking':
    case 'planning':
    case 'delegating':
      return 'dot dot--blue dot--pulse';
    default:
      return 'dot dot--green dot--pulse';
  }
}

/** Short role hint: the first clause of the description. */
export function roleHint(description: string, max = 52): string {
  const first = description.split(/[.:;]/)[0]?.trim() ?? '';
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

/** Vendored Keboola roles share a "kbc-" prefix; drop it in tight lists. */
export const shortName = (name: string) => name.replace(/^kbc-/, '');
