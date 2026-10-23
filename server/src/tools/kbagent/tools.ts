/** LangChain tools that let an agent call the kbagent CLI within its policy. */
import { tool } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { z } from 'zod';
import { buildChildEnv } from './env.ts';
import { buildInvocation } from './policy.ts';
import { runKbagent } from './runner.ts';
import type { ExecFn, RunResult } from './runner.ts';
import { SQL_OPERATIONS } from './sql.ts';
import type { Access, Category, InvocationResult } from './types.ts';

export interface KbagentToolsOptions {
  readonly access: Access;
  /** kbagent project alias every call is pinned to. */
  readonly project?: string;
  /** Keboola dev branch id every branch-aware call is pinned to. */
  readonly branch?: string | number;
  /** Separate kbagent config directory (projects, tokens, policy) for this agent. */
  readonly configDir?: string;
  readonly timeoutMs?: number;
  readonly maxOutputChars?: number;
  /** Parent environment to filter; defaults to process.env. */
  readonly env?: NodeJS.ProcessEnv;
  /** Explicit per-agent variables, e.g. KBAGENT_PROJECT_FROM_ENV + KBC_TOKEN + KBC_STORAGE_API_URL. */
  readonly extraEnv?: Readonly<Record<string, string>>;
  readonly exec?: ExecFn;
}

/** Shown in the UI next to a tool call; never sent back to the model. */
export interface KbagentCallArtifact {
  readonly operation?: string;
  readonly category?: Category;
  readonly ok: boolean;
  readonly exitCode?: number | null;
  readonly purpose: string;
  readonly rejected?: string;
}

const inputSchema = z.object({
  args: z
    .array(z.string())
    .min(1)
    .describe('kbagent arguments without the leading "kbagent", e.g. ["config", "list"]'),
  purpose: z.string().min(1).max(200).describe('One short sentence: why you run this command'),
});

type Input = z.infer<typeof inputSchema>;

const SAFE_CONVERSATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function conversationIdFrom(config: RunnableConfig | undefined): string | undefined {
  const threadId: unknown = config?.configurable?.thread_id;
  return typeof threadId === 'string' && SAFE_CONVERSATION_ID.test(threadId) ? threadId : undefined;
}

function scopeNote(options: KbagentToolsOptions): string {
  const parts = [
    options.project === undefined ? undefined : `project "${options.project}"`,
    options.branch === undefined ? undefined : `development branch ${options.branch}`,
  ].filter(Boolean);
  return parts.length === 0 ? '' : ` Calls are pinned to ${parts.join(' and ')}; you do not need to pass them.`;
}

const READ_DESCRIPTION = `Run a read-only kbagent (Keboola CLI) command and get JSON back. Pass the arguments without the leading "kbagent". Examples:
- ["config", "list", "--component-type", "transformation"]
- ["search", "customer_id", "--search-type", "config-based"]
- ["job", "list", "--status", "error", "--limit", "10"]
- ["job", "detail", "--job-id", "123", "--log-tail-lines", "200"]
Use ["<command>", "--help"] to see a command's options. Writes are blocked here.`;

const WRITE_DESCRIPTION = `Run a kbagent (Keboola CLI) command that changes the project; the user approves each call. Prefer --dry-run first when the command supports it. Destructive operations (deleting, merging to production) are blocked: ask the user to do them. Examples:
- ["branch", "create", "--name", "fix-orders-join"]
- ["config", "update", "--component-id", "keboola.snowflake-transformation", "--config-id", "123", "--set", "parameters.limit=100", "--dry-run"]
- ["workspace", "query", "--workspace-id", "456", "--sql", "SELECT COUNT(*) FROM \\"orders\\""]
Use kbagent_read for anything that only reads.`;

const SQL_DESCRIPTION = `Query Keboola data with SQL through a workspace (kbagent workspace commands only). Each call waits for the user's approval unless the user allowed SQL for this chat. Typical flow: reuse or create one workspace, load only the tables you need, then run SELECTs. Examples:
- ["workspace", "list"] to reuse an existing workspace
- ["workspace", "create", "--name", "agent-analysis"] (returns workspace_id)
- ["workspace", "load", "--workspace-id", "123", "--tables", "in.c-crm.orders"]
- ["workspace", "query", "--workspace-id", "123", "--sql", "SELECT COUNT(*) FROM \\"orders\\"", "--limit", "100"]
- ["workspace", "from-transformation", "--component-id", "keboola.snowflake-transformation", "--config-id", "456"] to debug a transformation with its inputs loaded
Results are capped by --limit (default 500 rows): check statements[].truncated and total_rows, use COUNT(*) for counts. Only read data: never INSERT, UPDATE, DELETE or DROP. Write SQL in the project's backend dialect (see ["project", "info"] via kbagent_read: Snowflake or BigQuery).`;

function formatResult(result: RunResult): string {
  if (result.ok) return typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
  return JSON.stringify({
    ok: false,
    exitCode: result.exitCode,
    hint: result.hint,
    output: result.output,
    ...(result.truncated ? { truncated: true } : {}),
    ...(result.stderr === undefined ? {} : { stderr: result.stderr }),
  });
}

type Invoke = (args: readonly string[], conversationId: string | undefined) => InvocationResult;

/** Policy for one tool: which access level, and optionally which operations only. */
const invokeWith =
  (access: Access, options: KbagentToolsOptions, operations?: ReadonlySet<string>): Invoke =>
  (args, conversationId) =>
    buildInvocation({
      args,
      access,
      ...(operations === undefined ? {} : { operations }),
      ...(options.project === undefined ? {} : { project: options.project }),
      ...(options.branch === undefined ? {} : { branch: options.branch }),
      ...(conversationId === undefined ? {} : { conversationId }),
    });

function createTool(name: string, description: string, options: KbagentToolsOptions, invoke: Invoke) {
  const env = buildChildEnv({
    parentEnv: options.env ?? process.env,
    ...(options.configDir === undefined ? {} : { configDir: options.configDir }),
    ...(options.project === undefined ? {} : { project: options.project }),
    ...(options.extraEnv === undefined ? {} : { extraEnv: options.extraEnv }),
  });

  return tool(
    async (input: Input, config?: RunnableConfig): Promise<[string, KbagentCallArtifact]> => {
      const invocation = invoke(input.args, conversationIdFrom(config));
      if (!invocation.ok) {
        return [`Rejected: ${invocation.reason}`, { ok: false, purpose: input.purpose, rejected: invocation.reason }];
      }
      const result = await runKbagent({
        argv: invocation.argv,
        env,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        ...(options.maxOutputChars === undefined ? {} : { maxOutputChars: options.maxOutputChars }),
        ...(options.exec === undefined ? {} : { exec: options.exec }),
      });
      return [
        formatResult(result),
        {
          operation: invocation.operation,
          category: invocation.category,
          ok: result.ok,
          exitCode: result.exitCode,
          purpose: input.purpose,
        },
      ];
    },
    {
      name,
      description: description + scopeNote(options),
      schema: inputSchema,
      responseFormat: 'content_and_artifact',
    },
  );
}

/** kbagent_read always; kbagent_write only for write access (put it behind human approval). */
export function createKbagentTools(options: KbagentToolsOptions) {
  const read = createTool('kbagent_read', READ_DESCRIPTION, options, invokeWith('read', options));
  return options.access === 'write'
    ? [read, createTool('kbagent_write', WRITE_DESCRIPTION, options, invokeWith('write', options))]
    : [read];
}

/** kbagent_sql: workspace commands for querying data only; put it behind human approval. */
export function createKbagentSqlTool(options: Omit<KbagentToolsOptions, 'access'>) {
  const sqlOptions: KbagentToolsOptions = { ...options, access: 'write' };
  return createTool('kbagent_sql', SQL_DESCRIPTION, sqlOptions, invokeWith('write', sqlOptions, SQL_OPERATIONS));
}
