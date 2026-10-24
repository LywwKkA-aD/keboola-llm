import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { type RoutineInfo, routinesApi } from '../../api/routines.ts';
import { formatWhen } from '../../lib/schedule.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import '../../styles/routines.css';

const MAX_RUNS = 5;

/** Overview block: the latest run of each routine, newest first, linking to its chat. Hidden until one has run. */
export function RoutineRuns() {
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
    <section className="panel-section" aria-labelledby={headingId}>
      <div className="panel-section__head">
        <span className="label" id={headingId}>
          {t('routines.latest')}
        </span>
      </div>
      <ul className="run-list">
        {runs.map(({ routine, run }) => (
          <li key={routine.name}>
            <span className={`dot${run.running ? ' dot--blue dot--pulse' : ''}`} />
            <Link to={`/chat/${run.threadId}`}>{routine.title}</Link>
            <span className="routine-runs__when">{formatWhen(run.at, settings.language)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
