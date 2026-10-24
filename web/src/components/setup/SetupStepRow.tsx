import { useId, useState } from 'react';
import type { SetupReport, SetupStatus, SetupStep } from '../../api/setup-types.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { CommandBlock } from './CommandBlock.tsx';
import { commandFor, type Os } from './commands.ts';
import { ConnectProject } from './ConnectProject.tsx';
import { OmniRouteKeyForm } from './OmniRouteKeyForm.tsx';
import { ModelPicker, ProjectPicker } from './Pickers.tsx';
import { StepFacts } from './StepFacts.tsx';

const DOT: Readonly<Record<SetupStatus, string>> = { ok: 'dot--green', fail: 'dot--red', blocked: '' };
const CHIP: Readonly<Record<SetupStatus, string>> = { ok: 'chip--green', fail: 'chip--red', blocked: '' };

interface FixProps {
  readonly step: SetupStep;
  readonly report: SetupReport;
  readonly os: Os;
  readonly onChanged: () => void;
}

/** The key form while no working key is saved; behind a button once one works, to replace it. */
function KeyFix({ step, report, onChanged }: Omit<FixProps, 'os'>) {
  const { t } = useSettings();
  const [replacing, setReplacing] = useState(false);
  const saved = () => {
    setReplacing(false);
    onChanged();
  };
  if (step.status === 'fail' || !report.omniroute.apiKeySet || replacing) return <OmniRouteKeyForm omniroute={report.omniroute} onSaved={saved} />;
  if (step.status !== 'ok') return null;
  return (
    <button type="button" className="btn setup-link" onClick={() => setReplacing(true)}>
      {t('setup.key.replace')}
    </button>
  );
}

/** What the user can do about a step: a form, a picker or a command to copy. */
function StepFix({ step, report, os, onChanged }: FixProps) {
  if (step.id === 'apiKey') return <KeyFix step={step} report={report} onChanged={onChanged} />;
  if (step.status !== 'fail') return null;
  if (step.id === 'model') return <ModelPicker report={report} onChanged={onChanged} />;
  if (step.id === 'project') return <ProjectPicker report={report} onChanged={onChanged} />;
  if (step.reason === 'projectsNone') return <ConnectProject os={os} />;
  const command = step.reason && commandFor(step.reason, os);
  return command ? <CommandBlock command={command} os={os} /> : null;
}

/** One step of the checklist: status, a one-line explanation, what the server found and the fix. */
export function SetupStepRow({ step, number, checking, onRecheck, ...fix }: FixProps & {
  readonly number: number;
  readonly checking: boolean;
  readonly onRecheck: () => void;
}) {
  const { t } = useSettings();
  const titleId = useId();
  // The key can be pasted before OmniRoute runs: say how to get one rather than "waiting".
  const reason = step.status === 'fail' ? step.reason : step.id === 'apiKey' && !fix.report.omniroute.apiKeySet ? 'keyMissing' : undefined;
  const explanation = reason
    ? t(`setup.reason.${reason}` as const)
    : step.status === 'blocked'
      ? t('setup.waiting')
      : t(`setup.about.${step.id}` as const);

  return (
    <li className={`setup-step setup-step--${step.status}`} aria-labelledby={titleId}>
      <span className={`dot ${DOT[step.status]}`} aria-hidden="true" />
      <div className="setup-step__body">
        <div className="setup-step__head">
          <span id={titleId} className="setup-step__title">
            {number}. {t(`setup.step.${step.id}` as const)}
          </span>
          <span className={`chip ${CHIP[step.status]}`}>{t(`setup.status.${step.status}` as const)}</span>
        </div>
        <p className="setup-step__text">{explanation}</p>
        <StepFacts step={step} />
        <StepFix step={step} {...fix} />
        {step.status === 'fail' && (
          <button type="button" className="btn btn--small setup-step__recheck" disabled={checking} onClick={onRecheck}>
            {t('setup.checkAgain')}
          </button>
        )}
      </div>
    </li>
  );
}
