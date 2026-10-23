/**
 * What agents may never do through kbagent, on top of kbagent's own firewall
 * (--deny-writes / --deny-destructive). Every entry says why.
 */

/** Whole command groups that are off-limits. */
export const DENIED_GROUPS: ReadonlyMap<string, string> = new Map([
  ['auth', 'sign-in and sessions are managed by the human'],
  ['permissions', 'the firewall policy is managed by the app'],
  ['token', 'Storage tokens are credentials'],
  ['org', 'organization administration'],
  ['feature', 'feature flags need a super-admin token'],
  ['init', 'changes the local kbagent workspace'],
  ['update', 'kbagent upgrades are done by the human'],
  ['serve', 'starts a long-running server'],
  ['http', 'raw HTTP against kbagent serve bypasses command-level rules'],
  ['agent', 'kbagent scheduled tasks are a separate automation system'],
  ['repl', 'interactive mode'],
  ['dev-portal', 'component publishing is out of scope'],
  ['kai', 'Keboola AI assistant is not supported by this app yet'],
  ['ai', 'Keboola AI assistant is not supported by this app yet'],
  ['sync', 'writes project files to the local disk'],
]);

/** Single operations that are off-limits even though their group is allowed. */
export const DENIED_OPERATIONS: ReadonlyMap<string, string> = new Map([
  ['lineage.server', 'starts a long-running local server'],
  ['branch.use', 'changes the active branch for every agent; pass --branch instead'],
  ['branch.reset', 'changes the active branch for every agent'],
  ['project.use', 'changes the default project for every agent'],
  ['project.member-list', 'exposes personal data of project members'],
  ['project.invitation-list', 'exposes personal data of invited people'],
  ['data-app.password', 'reveals a credential'],
  ['data-app.secrets-get', 'reveals a credential'],
  ['data-app.secrets-set', 'writes credentials'],
  ['data-app.git-credentials', 'reveals a credential'],
  ['data-app.git-credentials-create', 'creates credentials'],
  ['data-app.logs', 'logs may echo runtime secrets'],
  ['storage.download-table', 'writes files to the local disk'],
  ['storage.file-download', 'writes files to the local disk'],
  ['storage.upload-table', 'reads files from the local disk'],
  ['storage.file-upload', 'reads files from the local disk'],
  ['semantic-layer.token', 'handles a metastore credential'],
  ['semantic-layer.scope.add', 'shares semantic-layer objects with other projects'],
  ['semantic-layer.scope.remove', 'cross-project sharing is managed by the human'],
  ['semantic-layer.scope.set', 'shares semantic-layer objects with other projects'],
  ['semantic-layer.scope.request-create', 'cross-project sharing is managed by the human'],
  ['semantic-layer.scope.request-delete', 'cross-project sharing is managed by the human'],
  ['sharing.share', 'exposes data to other projects'],
  ['sharing.unshare', 'cross-project sharing is managed by the human'],
  ['sharing.link', 'cross-project sharing is managed by the human'],
  ['sharing.unlink', 'cross-project sharing is managed by the human'],
  ['notification.create', 'changes who receives emails'],
  ['notification.replace-recipient', 'changes who receives emails'],
]);

/** Flags agents may not pass, matched exactly. */
export const FORBIDDEN_FLAGS: ReadonlyMap<string, string> = new Map([
  ['--config-dir', 'the app chooses the kbagent config directory'],
  ['--deny-writes', 'the app sets the firewall flags'],
  ['--deny-destructive', 'the app sets the firewall flags'],
  ['--conversation-id', 'the app sets the conversation id'],
  ['--allow-env-manage-token', 'manage tokens are credentials'],
  ['--install-completion', 'modifies the shell configuration'],
  ['--show-completion', 'not useful for agents'],
  ['--verbose', 'debug output is not useful for agents'],
  ['--version', 'not useful for agents'],
  ['--reveal', 'reveals a secret'],
  ['--copy', 'uses the clipboard'],
  ['--open', 'opens a browser'],
  ['--stdin', 'stdin is not available to agents'],
  ['--file', 'reads or writes the local disk'],
  ['--directory', 'reads or writes the local disk'],
  ['--output', 'writes to the local disk'],
  ['--output-dir', 'writes to the local disk'],
  ['--output-file', 'writes to the local disk'],
  ['--target-dir', 'writes to the local disk'],
  ['--configuration-file', 'reads the local disk; pass --configuration with inline JSON'],
  ['--sql-file', 'reads the local disk; pass --sql inline'],
  ['--op-file', 'reads the local disk'],
  ['--from-file', 'reads the local disk'],
  ['--from-csv', 'reads the local disk'],
  ['--file-a', 'reads the local disk'],
  ['--file-b', 'reads the local disk'],
  ['--description-file', 'reads the local disk'],
  ['--secrets-file', 'reads credentials from the local disk'],
  ['--public-key-file', 'reads the local disk'],
  ['--git-pat-file', 'reads credentials from the local disk'],
  ['--git-pat-env', 'reads credentials from the environment'],
  ['--keep-token-file', 'handles credentials'],
]);

/** Flag name prefixes agents may not pass. */
export const FORBIDDEN_FLAG_PREFIXES: ReadonlyMap<string, string> = new Map([
  ['--token', 'Storage tokens are credentials'],
  ['--allow-plaintext', 'secrets must stay encrypted'],
]);

/** Agent-supplied flags we silently drop because the app always sets them. */
export const DROPPED_FLAGS: ReadonlySet<string> = new Set(['--json', '-j', '--no-color']);

/** Flags that reach other projects; rejected when the tool is scoped to one project. */
export const CROSS_PROJECT_FLAGS: ReadonlySet<string> = new Set([
  '--all-projects',
  '--from-project',
  '--target-project',
  '--target-project-ids',
  '--to-project',
  '--project-a',
  '--project-b',
  '--source-project-id',
]);

/** Writes that never touch production data, so they stay allowed when the tool is pinned to a dev branch. */
export const BRANCH_AGNOSTIC_WRITES: ReadonlySet<string> = new Set([
  'branch.create',
  'encrypt.values',
  'workspace.create',
  'workspace.from-transformation',
  'workspace.load',
  'workspace.query',
  'workspace.sql-improve',
]);
