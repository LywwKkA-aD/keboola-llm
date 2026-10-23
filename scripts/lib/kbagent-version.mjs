/** Version recorded in the header of server/src/tools/kbagent/operations-snapshot.ts. */
export function snapshotVersion(text) {
  return /Snapshot of kbagent v([\d.]+)/.exec(text)?.[1] ?? null;
}

/** Compare `kbagent --version` output with the snapshot version. */
export function compareKbagent(versionOutput, snapshot) {
  const detail = versionOutput.trim();
  const installed = /v?(\d+\.\d+\.\d+)/.exec(detail)?.[1];
  if (!snapshot || installed === snapshot) return { level: 'ok', detail };
  return {
    level: 'warn',
    detail: `${detail}, but the permission snapshot is for ${snapshot}: run npm run kbagent:snapshot`,
  };
}
