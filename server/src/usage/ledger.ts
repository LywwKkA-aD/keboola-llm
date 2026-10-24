/** Token usage by day and agent: pure functions over the ledger the store keeps in DATA_DIR/usage.json. */

export interface UsageTotals {
  /** Model calls. */
  readonly calls: number;
  /** Prompt tokens, cache reads and writes included. */
  readonly input: number;
  /** Prompt tokens read from the provider's prompt cache (billed at a fraction of the price). */
  readonly cached: number;
  /** Prompt tokens written to the cache (billed a little above the price, then read cheaply). */
  readonly cacheWrite: number;
  readonly output: number;
}

export interface UsageSample {
  readonly agent: string;
  readonly input: number;
  readonly cached: number;
  readonly cacheWrite: number;
  readonly output: number;
}

export interface LedgerDay {
  readonly totals: UsageTotals;
  readonly agents: Readonly<Record<string, UsageTotals>>;
}

/** Local date (YYYY-MM-DD) to that day's usage. */
export type Ledger = Readonly<Record<string, LedgerDay>>;

export interface UsageReport {
  readonly today: UsageTotals;
  /** The last 7 days, today included. */
  readonly week: UsageTotals;
  /** Everything the ledger keeps. */
  readonly total: UsageTotals;
  /** The first day with usage. */
  readonly since?: string;
  /** The last 14 days, oldest first. */
  readonly days: readonly ({ readonly date: string } & UsageTotals)[];
  /** Today by agent, the biggest first. */
  readonly agents: readonly ({ readonly agent: string } & UsageTotals)[];
}

export const ZERO: UsageTotals = { calls: 0, input: 0, cached: 0, cacheWrite: 0, output: 0 };

const plus = (a: UsageTotals, b: UsageTotals): UsageTotals => ({
  calls: a.calls + b.calls,
  input: a.input + b.input,
  cached: a.cached + b.cached,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  output: a.output + b.output,
});

const sum = (list: readonly UsageTotals[]) => list.reduce(plus, ZERO);

export function addUsage(ledger: Ledger, date: string, { agent, ...tokens }: UsageSample): Ledger {
  const entry: UsageTotals = { calls: 1, ...tokens };
  const day = ledger[date] ?? { totals: ZERO, agents: {} };
  return {
    ...ledger,
    [date]: { totals: plus(day.totals, entry), agents: { ...day.agents, [agent]: plus(day.agents[agent] ?? ZERO, entry) } },
  };
}

/** The date `days` before `date` (both YYYY-MM-DD). */
function daysBefore(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

const lastDays = (today: string, count: number) => Array.from({ length: count }, (_, index) => daysBefore(today, count - 1 - index));

export function reportOf(ledger: Ledger, today: string): UsageReport {
  const totalsOn = (date: string) => ledger[date]?.totals ?? ZERO;
  const since = Object.keys(ledger).toSorted()[0];
  const agents = Object.entries(ledger[today]?.agents ?? {})
    .map(([agent, totals]) => ({ agent, ...totals }))
    .toSorted((a, b) => b.input + b.output - (a.input + a.output));
  return {
    today: totalsOn(today),
    week: sum(lastDays(today, 7).map(totalsOn)),
    total: sum(Object.values(ledger).map((day) => day.totals)),
    ...(since ? { since } : {}),
    days: lastDays(today, 14).map((date) => ({ date, ...totalsOn(date) })),
    agents,
  };
}

/** The ledger without days more than `keepDays` before today. */
export function pruneLedger(ledger: Ledger, today: string, keepDays: number): Ledger {
  const oldest = daysBefore(today, keepDays);
  return Object.fromEntries(Object.entries(ledger).filter(([date]) => date >= oldest));
}
