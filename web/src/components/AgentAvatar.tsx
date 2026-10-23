const initials = (name: string) =>
  name
    .split('-')
    .filter((part) => part !== 'kbc')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/** Placeholder avatar until the octopus sprites exist: a colored badge with initials. */
export function AgentAvatar({ name, color, size = 28, busy = false }: { name: string; color: string; size?: number; busy?: boolean }) {
  return (
    <span
      className={`avatar${busy ? ' avatar--busy' : ''}`}
      style={{ background: color, width: size, height: size, fontSize: size * 0.4 }}
      title={name}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
