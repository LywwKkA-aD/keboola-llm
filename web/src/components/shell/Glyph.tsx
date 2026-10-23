/**
 * The studio mark: a Keboola-style octopus in brand blue - tall bulb head with two small eyes low on it,
 * two arms raised, four legs below. Our own drawing, not the Keboola logo file.
 */
export function Glyph({ size = 22, title }: { size?: number; title?: string }) {
  return (
    <svg
      className="glyph"
      width={size}
      height={size * (28 / 24)}
      viewBox="0 0 24 28"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d="M12 1.2c4.9 0 7.6 3.2 7.6 7.9 0 4.3-3.3 7-7.6 7s-7.6-2.7-7.6-7c0-4.7 2.7-7.9 7.6-7.9z" fill="var(--brand)" />
      <circle cx="10" cy="12.6" r="1.25" fill="var(--color-surface)" />
      <circle cx="14" cy="12.6" r="1.25" fill="var(--color-surface)" />
      <g stroke="var(--brand)" strokeWidth="2.1" strokeLinecap="round" fill="none">
        <path d="M5.6 16.4c-2-.9-3.1-2.6-3.3-5.2" />
        <path d="M18.4 16.4c2-.9 3.1-2.6 3.3-5.2" />
        <path d="M9.6 18.2c-2.6 1.3-4.3 3.1-5 5.4" />
        <path d="M11.1 18.8c-1.1 2-1.5 4.2-1.3 6.6" />
        <path d="M12.9 18.8c1.1 2 1.5 4.2 1.3 6.6" />
        <path d="M14.4 18.2c2.6 1.3 4.3 3.1 5 5.4" />
      </g>
    </svg>
  );
}
