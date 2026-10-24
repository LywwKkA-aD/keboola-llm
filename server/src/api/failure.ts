import { modelErrorKind } from '../llm/retry.ts';

/**
 * Why a run ended before the team finished, for the chat to explain it (the UI words each reason):
 * stopped by the user, the model unavailable (overloaded, rate limited, unreachable) or refusing the
 * request (key, model id, request shape), the step limit of one run, or anything else.
 */
export type FailureReason = 'stopped' | 'model_unavailable' | 'model_rejected' | 'step_limit' | 'error';

export interface Failure {
  readonly reason: FailureReason;
  /** The underlying error message, for the details. */
  readonly error: string;
}

const MAX_MESSAGE_CHARS = 500;

// LangChain appends a docs link to some errors; in the chat it is noise.
const clean = (message: string) =>
  message
    .replace(/\s*Troubleshooting URL:\s*\S+/g, '')
    .trim()
    .slice(0, MAX_MESSAGE_CHARS) || 'Unknown error';

export function describeFailure(error: unknown, { stopped }: { stopped: boolean }): Failure {
  if (stopped) return { reason: 'stopped', error: 'Stopped by the user' };
  const message = clean(error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.name === 'GraphRecursionError') return { reason: 'step_limit', error: message };
  const kind = modelErrorKind(error);
  if (kind === 'transient') return { reason: 'model_unavailable', error: message };
  if (kind === 'permanent') return { reason: 'model_rejected', error: message };
  return { reason: 'error', error: message };
}
