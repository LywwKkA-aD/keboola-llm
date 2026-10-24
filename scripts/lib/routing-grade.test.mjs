import { describe, expect, it } from 'vitest';
import { gradeRouting, isSettled, PLAN, NONE } from './routing-grade.mjs';

describe('gradeRouting', () => {
  it('passes when the first hand-off goes to one of the expected agents', () => {
    expect(gradeRouting({ expect: ['kbc-sql-reviewer'] }, ['kbc-sql-reviewer'])).toMatchObject({ ok: true, got: ['kbc-sql-reviewer'] });
    expect(gradeRouting({ expect: ['keboola-expert', 'keboola-config-analyzer'] }, ['keboola-config-analyzer', 'x'])).toMatchObject({ ok: true });
    expect(gradeRouting({ expect: ['kbc-sql-reviewer'] }, ['keboola-expert', 'kbc-sql-reviewer'])).toMatchObject({ ok: false, missed: ['kbc-sql-reviewer'] });
  });

  it('with all, wants every expected agent among the hand-offs, in any order', () => {
    const scenario = { expect: ['a', 'b', 'c'], all: true };
    expect(gradeRouting(scenario, ['c', 'a', 'b'])).toMatchObject({ ok: true });
    expect(gradeRouting(scenario, ['c', 'a'])).toMatchObject({ ok: false, missed: ['b'] });
  });

  it('accepts a plan for approval or a direct answer where the scenario allows it', () => {
    expect(gradeRouting({ expect: ['keboola-developer', PLAN] }, [PLAN])).toMatchObject({ ok: true });
    expect(gradeRouting({ expect: [NONE] }, [])).toMatchObject({ ok: true, got: [NONE] });
    expect(gradeRouting({ expect: ['keboola-expert'] }, [])).toMatchObject({ ok: false, got: [NONE] });
  });

  it('fails on a forbidden agent anywhere', () => {
    expect(gradeRouting({ expect: ['a'], forbid: ['keboola-developer'] }, ['a', 'keboola-developer'])).toMatchObject({ ok: false, violations: ['keboola-developer'] });
  });
});

describe('isSettled', () => {
  it('settles at the first hand-off, or once every expected one for all', () => {
    expect(isSettled({ expect: ['a'] }, [])).toBe(false);
    expect(isSettled({ expect: ['a'] }, ['b'])).toBe(true);
    expect(isSettled({ expect: ['a', 'b'], all: true }, ['a'])).toBe(false);
    expect(isSettled({ expect: ['a', 'b'], all: true }, ['b', 'a'])).toBe(true);
  });
});
