/** Parse "v24.14.0" or "24.14.0" into [major, minor, patch]; null when malformed. */
export function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version ?? '');
  return match ? match.slice(1, 4).map(Number) : null;
}

const compare = (a, b) => a.reduce((result, part, i) => result || part - b[i], 0);

/** Mirrors the "engines.node" range: >=22.22.2 <23 || >=24.0.0 <27 (same as OmniRoute). */
export function isSupportedNode(version) {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  const [major] = parsed;
  if (major === 22) return compare(parsed, [22, 22, 2]) >= 0;
  return major >= 24 && major < 27;
}
