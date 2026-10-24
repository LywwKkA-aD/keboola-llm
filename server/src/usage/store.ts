import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { EventBus } from '../api/bus.ts';
import { addUsage, type Ledger, pruneLedger, reportOf, type UsageReport, type UsageSample } from './ledger.ts';

/** About a year and a month: enough to compare with the same month last year. */
const KEEP_DAYS = 400;

const count = z.number().int().nonnegative();
const totals = z.object({ calls: count, input: count, cached: count, cacheWrite: count, output: count });
const ledgerSchema = z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.object({ totals, agents: z.record(z.string(), totals) }));

export interface UsageStore {
  record(sample: UsageSample): void;
  report(): UsageReport;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** YYYY-MM-DD of the machine's own calendar, where the analyst's working day is. */
export const localDate = (at = new Date()) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;

function read(file: string): Ledger {
  try {
    const parsed = ledgerSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** Token usage by day and agent in one JSON file (DATA_DIR/usage.json), rewritten atomically on every model call. */
export function createUsageStore({ file, today = () => localDate(), keepDays = KEEP_DAYS }: { file: string; today?: () => string; keepDays?: number }): UsageStore {
  let ledger = read(file);

  const save = (next: Ledger) => {
    ledger = next;
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(ledger)}\n`);
    renameSync(temp, file);
  };

  return {
    record(sample) {
      const date = today();
      save(pruneLedger(addUsage(ledger, date, sample), date, keepDays));
    },
    report: () => reportOf(ledger, today()),
  };
}

/** Count every model call of every chat; returns the unsubscribe function. */
export function trackUsage(bus: EventBus, store: UsageStore): () => void {
  return bus.subscribe(({ event }) => {
    if (event.type !== 'usage') return;
    const { agent, input, cached, cacheWrite, output } = event;
    store.record({ agent, input, cached, cacheWrite, output });
  });
}
