import { z } from 'zod';

export const NAME_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

export const agentFrontmatterSchema = z
  .object({
    name: z.string().regex(NAME_RE, 'lowercase letters, digits and dashes, 2-63 chars'),
    description: z.string().min(10).max(1024),
    role: z.enum(['orchestrator', 'subagent']).default('subagent'),
    enabled: z.boolean().default(true),
    // Repo-relative path to an upstream agent file whose body is prepended to this prompt.
    extends: z.string().optional(),
    skills: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([]),
    // Virtual path prefixes this agent may write to, e.g. "/agents/" or "/knowledge/".
    writes: z.array(z.string().startsWith('/')).default([]),
    // Tool names whose every call waits for the user's approval in the UI.
    approve: z.array(z.string()).default([]),
    keboola: z
      .object({
        project: z.string().optional(),
        branch: z.string().optional(),
        access: z.enum(['read', 'write']).default('read'),
      })
      .strict()
      .optional(),
    model: z.string().optional(),
    avatar: z.object({ color: z.string().optional(), prop: z.string().optional() }).strict().optional(),
  })
  .strict();

export type AgentFrontmatter = z.infer<typeof agentFrontmatterSchema>;

export interface AgentDefinition extends AgentFrontmatter {
  readonly prompt: string;
  readonly file: string;
  readonly basedOn?: string;
}

export interface SkillInfo {
  readonly name: string;
  readonly description: string;
  readonly sourceId: string;
  readonly folder: string;
}

export interface SkillSource {
  readonly id: string;
  readonly dir: string;
}

export interface LoadError {
  readonly file: string;
  readonly message: string;
}

export interface LoadResult<T> {
  readonly items: readonly T[];
  readonly errors: readonly LoadError[];
}
