import { describe, expect, it } from 'vitest';
import { addUsage, type Ledger, pruneLedger, reportOf, ZERO } from './ledger.ts';

const sample = (agent: string, input: number, cached = 0, output = 10, cacheWrite = 0) => ({ agent, input, cached, cacheWrite, output });

describe('usage ledger', () => {
  const ledger = [
    ['2026-10-10', sample('lead', 1000, 0, 50, 900)],
    ['2026-10-20', sample('lead', 1000, 800)],
    ['2026-10-24', sample('lead', 2000, 1500, 100)],
    ['2026-10-24', sample('scout', 3000, 2700, 200)],
    ['2026-10-24', sample('lead', 1000, 900, 50)],
  ].reduce<Ledger>((acc, [date, entry]) => addUsage(acc, date as string, entry as ReturnType<typeof sample>), {});

  it('sums calls and tokens by day and by agent', () => {
    expect(ledger['2026-10-24']?.totals).toEqual({ calls: 3, input: 6000, cached: 5100, cacheWrite: 0, output: 350 });
    expect(ledger['2026-10-24']?.agents.lead).toEqual({ calls: 2, input: 3000, cached: 2400, cacheWrite: 0, output: 150 });
  });

  it('reports today, the last 7 days and everything kept, with today by agent', () => {
    const report = reportOf(ledger, '2026-10-24');
    expect(report.today).toEqual({ calls: 3, input: 6000, cached: 5100, cacheWrite: 0, output: 350 });
    expect(report.week.input).toBe(7000);
    expect(report.total).toEqual({ calls: 5, input: 8000, cached: 5900, cacheWrite: 900, output: 410 });
    expect(report.since).toBe('2026-10-10');
    expect(report.agents.map((entry) => entry.agent)).toEqual(['scout', 'lead']);
  });

  it('lists the last 14 days oldest first, empty days as zeros', () => {
    const { days } = reportOf(ledger, '2026-10-24');
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({ date: '2026-10-11', ...ZERO });
    expect(days.at(-5)).toMatchObject({ date: '2026-10-20', input: 1000 });
    expect(days.at(-1)).toMatchObject({ date: '2026-10-24', input: 6000 });
  });

  it('counts across month ends', () => {
    const report = reportOf(addUsage({}, '2026-10-30', sample('lead', 5)), '2026-11-02');
    expect(report.week.input).toBe(5);
    expect(report.days.at(-4)?.date).toBe('2026-10-30');
  });

  it('reports nothing for an empty ledger', () => {
    const report = reportOf({}, '2026-10-24');
    expect(report.total).toEqual(ZERO);
    expect(report.since).toBeUndefined();
    expect(report.agents).toEqual([]);
  });

  it('drops days older than the kept window', () => {
    expect(Object.keys(pruneLedger(ledger, '2026-10-24', 10))).toEqual(['2026-10-20', '2026-10-24']);
  });

  it('never changes the ledger it was given', () => {
    const before = JSON.stringify(ledger);
    addUsage(ledger, '2026-10-24', sample('lead', 1));
    expect(JSON.stringify(ledger)).toBe(before);
  });
});
