/** LangChain tools that let an agent call the kbagent CLI within its policy. */
import { tool } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { z } from 'zod';
import { buildChildEnv } from './env.ts';
import { buildInvocation } from './policy.ts';
import { runKbagent } from './runner.ts';
import type { ExecFn, RunResult } from './runner.ts';
import type { Access, Category } from './types.ts';

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

function createTool(name: string, access: Access, description: string, options: KbagentToolsOptions) {
  const env = buildChildEnv({
    parentEnv: options.env ?? process.env,
    ...(options.configDir === undefined ? {} : { configDir: options.configDir }),
    ...(options.project === undefined ? {} : { project: options.project }),
    ...(options.extraEnv === undefined ? {} : { extraEnv: options.extraEnv }),
  });

  return tool(
    async (input: Input, config?: RunnableConfig): Promise<[string, KbagentCallArtifact]> => {
      const conversationId = conversationIdFrom(config);
      const invocation = buildInvocation({
        args: input.args,
        access,
        ...(options.project === undefined ? {} : { project: options.project }),
        ...(options.branch === undefined ? {} : { branch: options.branch }),
        ...(conversationId === undefined ? {} : { conversationId }),
      });
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
  const read = createTool('kbagent_read', 'read', READ_DESCRIPTION, options);
  return options.access === 'write'
    ? [read, createTool('kbagent_write', 'write', WRITE_DESCRIPTION, options)]
    : [read];
}
