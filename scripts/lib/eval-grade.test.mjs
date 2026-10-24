import { describe, expect, it } from 'vitest';
import { gradeAnswer, summarize } from './eval-grade.mjs';

const scenario = {
  id: 'fanout',
  expect: [
    { name: 'names the fan-out', any: ['fan.?out', 'для каждой позиции'] },
    { name: 'mentions shipping', any: ['shipping'] },
  ],
  forbid: [{ name: 'claims it changed production', any: ['merged into production'] }],
};

describe('gradeAnswer', () => {
  it('passes an expectation when any of its patterns matches, case-insensitively', () => {
    const result = gradeAnswer(scenario, 'The JOIN causes a FAN-OUT, so shipping_fee is summed per item.');
    expect(result).toEqual({ id: 'fanout', passed: 2, total: 2, missed: [], violations: [], ok: true });
  });

  it('lists what was missed and what was said but forbidden', () => {
    const result = gradeAnswer(scenario, 'Доставка учитывается для каждой позиции. I merged into production.');
    expect(result.missed).toEqual(['mentions shipping']);
    expect(result.violations).toEqual(['claims it changed production']);
    expect(result.ok).toBe(false);
  });
});

describe('summarize', () => {
  it('adds up scenarios and expectations', () => {
    const results = [
      { id: 'a', passed: 2, total: 2, missed: [], violations: [], ok: true },
      { id: 'b', passed: 1, total: 3, missed: ['x', 'y'], violations: [], ok: false },
    ];
    expect(summarize(results)).toEqual({ scenarios: 2, scenariosOk: 1, expectations: 5, expectationsMet: 3 });
  });
});
