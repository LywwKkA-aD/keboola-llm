import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { type RoutineInfo, type RoutineList, routinesApi } from '../../api/routines.ts';
import { browserTimeZone, describeSchedule, formatWhen } from '../../lib/schedule.ts';
import { useLive } from '../../live/live-context.tsx';
import { useSettings } from '../../state/settings-context.tsx';
import { SettingsSection } from './fields.tsx';
import '../../styles/routines.css';

function RoutineRow({ routine, busy, onToggle, onRun }: {
  routine: RoutineInfo;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onRun: () => void;
}) {
  const { t, settings } = useSettings();
  const titleId = useId();
  const running = routine.lastRun?.running === true;
  const zone = routine.timezone === browserTimeZone() ? '' : ` (${routine.timezone})`;
  const when = (iso: string) => formatWhen(iso, settings.language);

  return (
    <li className="routine" aria-labelledby={titleId}>
      <div className="routine__main">
        <div className="routine__head">
          <span className="routine__title" id={titleId}>
            {routine.title}
          </span>
          {running && <span className="chip chip--blue">{t('routines.running')}</span>}
        </div>
        <p className="routine__description">{routine.description}</p>
        <div className="routine__meta">
          <span className="mono">{`${describeSchedule(routine.schedule, settings.language, t)}${zone}`}</span>
          <span>{routine.nextRun ? t('routines.next').replace('{when}', when(routine.nextRun)) : t('routines.off')}</span>
          {routine.lastRun ? (
            <Link to={`/chat/${routine.lastRun.threadId}`}>{t('routines.last').replace('{when}', when(routine.lastRun.at))}</Link>
          ) : (
            <span>{t('routines.never')}</span>
          )}
        </div>
      </div>
      <div className="routine__actions">
        <label className="toggle">
          <input type="checkbox" checked={routine.enabled} disabled={busy} onChange={(event) => onToggle(event.target.checked)} />
          <span>{t('routines.schedule')}</span>
        </label>
        <button type="button" className="btn btn--small" disabled={busy || running} onClick={onRun}>
          {t('routines.runNow')}
        </button>
      </div>
    </li>
  );
}

/** Settings block for scheduled routines: switch each on or off for this installation, or run it now. */
export function RoutinesSection() {
  const { t } = useSettings();
  const { live } = useLive();
  const [list, setList] = useState<RoutineList>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const runningKey = live.running.join(',');

  const load = useCallback(() => {
    routinesApi.list().then(setList, (reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);
  // Recheck whenever a run starts or ends: a routine's run shows as running until it is done.
  useEffect(load, [load, runningKey]);

  const act = (name: string, action: () => Promise<unknown>) => {
    setBusy(name);
    setError(undefined);
    action()
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t('error.generic')))
      .finally(() => {
        setBusy(undefined);
        load();
      });
  };

  return (
    <SettingsSection title={t('routines.title')} hint={t('routines.hint')}>
      {error && <div className="error-banner">{error}</div>}
      {list && list.loadErrors.length > 0 && (
        <div className="notice">
          <span className="label">{t('routines.loadErrors')}</span>
          <ul>
            {list.loadErrors.map((entry) => (
              <li key={entry.file}>{`${entry.file}: ${entry.message}`}</li>
            ))}
          </ul>
        </div>
      )}
      {list?.routines.length === 0 && <p className="empty">{t('routines.none')}</p>}
      {list && list.routines.length > 0 && (
        <ul className="routines">
          {list.routines.map((routine) => (
            <RoutineRow
              key={routine.name}
              routine={routine}
              busy={busy === routine.name}
              onToggle={(enabled) => act(routine.name, () => routinesApi.setEnabled(routine.name, enabled))}
              onRun={() => act(routine.name, () => routinesApi.run(routine.name))}
            />
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
