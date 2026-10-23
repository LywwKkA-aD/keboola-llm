import { describe, expect, it } from 'vitest';
import { toResumeValue } from './approvals.ts';

const approve = { type: 'approve' } as const;
const reject = { type: 'reject', message: 'no' } as const;

describe('toResumeValue', () => {
  it('sends plain decisions for a single pending interrupt', () => {
    expect(toResumeValue([{ interruptId: 'a', decisions: [approve] }])).toEqual({ decisions: [approve] });
  });

  it('keys decisions by interrupt id when several are pending', () => {
    expect(
      toResumeValue([
        { interruptId: 'a', decisions: [approve] },
        { interruptId: 'b', decisions: [reject, approve] },
      ]),
    ).toEqual({ a: { decisions: [approve] }, b: { decisions: [reject, approve] } });
  });

  it('rejects an empty answer set', () => {
    expect(() => toResumeValue([])).toThrow();
  });
});
