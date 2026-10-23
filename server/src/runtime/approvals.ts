export type Decision =
  | { readonly type: 'approve' }
  | { readonly type: 'reject'; readonly message?: string };

export interface InterruptAnswer {
  readonly interruptId: string;
  readonly decisions: readonly Decision[];
}

/**
 * Build the Command resume value for pending human-in-the-loop interrupts. One interrupt takes
 * the decisions directly; several (e.g. parallel subagents) must be keyed by interrupt id.
 */
export function toResumeValue(answers: readonly InterruptAnswer[]): unknown {
  if (answers.length === 0) throw new Error('No pending approvals to answer');
  const [only] = answers;
  if (answers.length === 1 && only) return { decisions: only.decisions };
  return Object.fromEntries(answers.map((answer) => [answer.interruptId, { decisions: answer.decisions }]));
}
