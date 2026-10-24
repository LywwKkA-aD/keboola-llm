/** Grading for the routing evaluation (scripts/eval-routing.mjs): whom the lead hands a request to. */

/** The lead asked the user to approve a plan instead of handing the work off. */
export const PLAN = '@plan';
/** The lead answered itself. */
export const NONE = '@none';

/**
 * scenario: { expect: string[], all?: boolean, forbid?: string[] }. Without `all` the first hand-off must be one of
 * `expect`; with it every agent in `expect` must get a part of the work.
 * handoffs: agent names (or PLAN) in the order the lead used them.
 */
export function gradeRouting(scenario, handoffs) {
  const got = handoffs.length > 0 ? handoffs : [NONE];
  const missed = scenario.all ? scenario.expect.filter((name) => !got.includes(name)) : scenario.expect.includes(got[0]) ? [] : scenario.expect;
  const violations = (scenario.forbid ?? []).filter((name) => got.includes(name));
  return { ok: missed.length === 0 && violations.length === 0, got, missed, violations };
}

/** Whether there is enough to grade, so the run can be stopped. */
export function isSettled(scenario, handoffs) {
  if (!scenario.all) return handoffs.length > 0;
  return scenario.expect.every((name) => handoffs.includes(name));
}
