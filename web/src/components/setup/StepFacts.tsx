import type { SetupStep } from '../../api/setup-types.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { factParts } from './facts.ts';

/** What the server found for a step, in the user's language; technical values as code. */
export function StepFacts({ step }: { step: SetupStep }) {
  const { t } = useSettings();
  if (step.status === 'blocked') return null;
  // A server without facts only has its English terminal line.
  if (!step.facts) return step.detail ? <p className="setup-step__detail mono">{step.detail}</p> : null;
  const parts = factParts(step.facts, t);
  if (parts.length === 0) return null;
  return (
    <p className="setup-step__detail">
      {parts.map((part, index) =>
        // Parts never move, so their index is a stable key.
        'code' in part ? (
          <code key={index} className="setup-step__value">
            {part.code}
          </code>
        ) : (
          part.text
        ),
      )}
    </p>
  );
}
