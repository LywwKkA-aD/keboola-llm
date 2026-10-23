import type { ReactNode } from 'react';

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

/** A select whose empty option means "use the value from .env". */
export function EnvSelect({ label, value, options, envLabel, error, onChange }: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  envLabel: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const known = value === '' || options.some(([option]) => option === value);
  return (
    <label className="field">
      <span className="label">{label}</span>
      <select className="select" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{envLabel}</option>
        {!known && <option value={value}>{value}</option>}
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}
