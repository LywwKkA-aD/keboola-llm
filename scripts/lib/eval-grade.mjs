/**
 * Grading of team evaluations (scripts/eval.mjs): an answer meets an expectation when any of its patterns matches
 * (case-insensitive regular expressions) and must not match any forbidden pattern. Deterministic, no model involved.
 */

const matches = (text, patterns) => patterns.some((pattern) => new RegExp(pattern, 'iu').test(text));

/** @returns {{ id: string, passed: number, total: number, missed: string[], violations: string[], ok: boolean }} */
export function gradeAnswer(scenario, answer) {
  const expectations = scenario.expect ?? [];
  const missed = expectations.filter((expectation) => !matches(answer, expectation.any)).map((expectation) => expectation.name);
  const violations = (scenario.forbid ?? []).filter((rule) => matches(answer, rule.any)).map((rule) => rule.name);
  const passed = expectations.length - missed.length;
  return { id: scenario.id, passed, total: expectations.length, missed, violations, ok: missed.length === 0 && violations.length === 0 };
}

export function summarize(results) {
  return {
    scenarios: results.length,
    scenariosOk: results.filter((result) => result.ok).length,
    expectations: results.reduce((sum, result) => sum + result.total, 0),
    expectationsMet: results.reduce((sum, result) => sum + result.passed, 0),
  };
}
