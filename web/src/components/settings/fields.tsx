import { type ReactNode, useId } from 'react';
import { Select, type SelectOption } from '../Select.tsx';

/** A settings block: title and explanation on the left, controls on the right. */
export function SettingsSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="settings-section" aria-label={title}>
      <div className="settings-section__intro">
        <h2 className="settings-section__title">{title}</h2>
        {hint && <p className="muted settings-section__hint">{hint}</p>}
      </div>
      <div className="settings-section__body">{children}</div>
    </section>
  );
}

/** A row of mutually exclusive choices, rendered as a segmented control. */
export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(([option, text]) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            className={`segmented__item${value === option ? ' segmented__item--on' : ''}`}
            onClick={() => onChange(option)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A labelled select. */
export function SelectField<T extends string>({ label, value, options, error, onChange }: {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  error?: string | undefined;
  onChange: (value: T) => void;
}) {
  const labelId = useId();
  return (
    <div className="field">
      <span className="label" id={labelId}>
        {label}
      </span>
      <Select<T> aria-labelledby={labelId} value={value} options={options} onChange={onChange} />
      {error && <span className="field__error">{error}</span>}
    </div>
  );
}

/** A select whose empty option means "use the value from .env". */
export function EnvSelect({ label, value, options, envLabel, error, onChange }: {
  label: string;
  value: string;
  options: readonly SelectOption<string>[];
  envLabel: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const known = value === '' || options.some(([option]) => option === value);
  const choices: readonly SelectOption<string>[] = [['', envLabel], ...(known ? [] : [[value, value] as const]), ...options];
  return <SelectField label={label} value={value} options={choices} error={error} onChange={onChange} />;
}
