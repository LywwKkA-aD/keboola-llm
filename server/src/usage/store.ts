import { type FileIo, defaultIo, readJsonFile, writeJsonAtomic } from '../storage/json-file.ts';
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

const read = (file: string, io: FileIo): Ledger =>
  readJsonFile<Ledger>(file, { fallback: {}, io, parse: (raw) => {
    const parsed = ledgerSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  } });

/** Token usage by day and agent in one JSON file (DATA_DIR/usage.json), rewritten atomically on every model call. */
export function createUsageStore({ file, today = () => localDate(), keepDays = KEEP_DAYS, io = defaultIo }: {
  file: string;
  today?: () => string;
  keepDays?: number;
  io?: FileIo;
}): UsageStore {
  let ledger = read(file, io);

  // Memory follows the file: a failed write (logged by the caller) loses nothing already saved.
  const save = (next: Ledger) => {
    writeJsonAtomic(file, next, { compact: true, io });
    ledger = next;
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
    try {
      store.record({ agent, input, cached, cacheWrite, output });
    } catch (error) {
      console.warn(`[usage] could not save the token usage: ${(error as Error).message}`);
    }
  });
}
