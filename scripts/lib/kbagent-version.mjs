/** Versions named in the header of server/src/tools/kbagent/operations-snapshot.ts, e.g. ["0.100.4", "1.4.1"]. */
export function snapshotVersions(text) {
  const header = /Snapshot of kbagent (v[\d., v]+) operations/.exec(text)?.[1] ?? '';
  return [...header.matchAll(/v([\d.]+)/g)].map((match) => match[1]);
}

/**
 * Compare `kbagent --version` output with the versions the snapshot was made from. The snapshot covers each of them;
 * another version may know commands the app does not (they are refused) or reclassify some.
 */
export function compareKbagent(versionOutput, snapshot) {
  const detail = versionOutput.trim();
  const installed = /v?(\d+\.\d+\.\d+)/.exec(detail)?.[1];
  if (snapshot.length === 0 || snapshot.includes(installed)) return { level: 'ok', detail };
  return {
    level: 'warn',
    detail: `${detail}, but the permission snapshot is for ${snapshot.join(', ')}: new commands of this version are refused until npm run kbagent:snapshot`,
  };
}
