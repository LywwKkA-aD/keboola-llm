import { useState } from 'react';
import type { StringKey } from '../i18n/strings.ts';
import { formatDuration } from '../lib/format.ts';
import { KIND_TONE, kindOf } from '../lib/steps.ts';
import type { Activity } from '../state/run-state.ts';
import { useSettings } from '../state/settings-context.tsx';
import { shortName } from './home/mood.ts';

const STATUS_TONE: Record<Activity['status'], string> = { running: 'step__status--running', done: '', failed: 'step__status--failed' };

function StepRow({ step, open, onToggle }: { step: Activity; open: boolean; onToggle: () => void }) {
  const { t } = useSettings();
  const kind = kindOf(step);
  const tone = KIND_TONE[kind];
  const duration = step.startedAt && step.endedAt ? formatDuration(step.endedAt - step.startedAt) : '';
  const expandable = Boolean(step.args && Object.keys(step.args).length) || Boolean(step.preview);

  return (
    <li className={`step${open ? ' step--open' : ''}`}>
      <button type="button" className="step__row" onClick={onToggle} aria-expanded={open} disabled={!expandable}>
        <span className="step__chevron" aria-hidden="true">
          {expandable ? (open ? '−' : '+') : ''}
        </span>
        <span className={`chip${tone ? ` chip--${tone}` : ''} step__kind`}>{t(`kind.${kind}` as StringKey)}</span>
        <span className="step__who">
          {shortName(step.agent)}
          {step.kind === 'delegate' && <span className="muted"> → {shortName(step.target)}</span>}
          {step.kind !== 'delegate' && <span className="step__tool mono"> {step.target}</span>}
        </span>
        <span className="step__label">{step.label}</span>
        <span className={`step__status ${STATUS_TONE[step.status]}`}>{t(`status.${step.status}` as StringKey)}</span>
        <span className="step__duration mono">{duration}</span>
      </button>
      {open && expandable && (
        <div className="step__details">
          {step.args && Object.keys(step.args).length > 0 && (
            <>
              <span className="label">{t('chat.args')}</span>
              <pre className="request__code">{JSON.stringify(step.args, null, 2)}</pre>
            </>
          )}
          {step.preview && (
            <>
              <span className="label">{t('chat.result')}</span>
              <pre className="request__code">{step.preview}</pre>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** What the team did in this chat: delegations, tool calls and auto-approvals as compact, expandable rows. */
export function StepRows({ steps }: { steps: readonly Activity[] }) {
  const { t } = useSettings();
  const [open, setOpen] = useState<string>();
  if (steps.length === 0) return null;
  return (
    <section className="steps" aria-label={t('chat.steps')}>
      <div className="steps__head">
        <span className="label">{t('chat.steps')}</span>
        <span className="label">{steps.length}</span>
      </div>
      <ol className="steps__list">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} open={open === step.id} onToggle={() => setOpen((id) => (id === step.id ? undefined : step.id))} />
        ))}
      </ol>
    </section>
  );
}
