import { useEffect, useId, useState } from 'react';
import { type RoutineInfo, routinesApi } from '../../api/routines.ts';
import { formatWhen } from '../../lib/schedule.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';

const MAX_RUNS = 5;

/** Chats panel block: the latest run of each routine, newest first, opening its chat. Hidden until one has run. */
export function RoutineRuns({ onOpen }: { onOpen: (threadId: string) => void }) {
  const { t, settings } = useSettings();
  const { live } = useLive();
  const headingId = useId();
  const [routines, setRoutines] = useState<readonly RoutineInfo[]>([]);
  const runningKey = live.running.join(',');

  useEffect(() => {
    routinesApi.list().then(
      (list) => setRoutines(list.routines),
      () => setRoutines([]),
    );
  }, [runningKey]);

  const runs = routines
    .flatMap((routine) => (routine.lastRun ? [{ routine, run: routine.lastRun }] : []))
    .toSorted((a, b) => b.run.at.localeCompare(a.run.at))
    .slice(0, MAX_RUNS);
  if (runs.length === 0) return null;

  return (
    <section className="hud-section" aria-labelledby={headingId}>
      <h3 className="hud-section__title label" id={headingId}>
        {t('routines.latest')}
      </h3>
      <ul className="chat-list">
        {runs.map(({ routine, run }) => (
          <li key={routine.name}>
            <button type="button" className="chat-item" onClick={() => onOpen(run.threadId)}>
              <span className={`dot${run.running ? ' dot--blue dot--pulse' : ''}`} />
              <span className="chat-item__title">{routine.title}</span>
              <span className="chat-item__when">{formatWhen(run.at, settings.language)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
