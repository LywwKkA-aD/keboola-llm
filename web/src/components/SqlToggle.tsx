import { useSettings } from '../state/settings-context.tsx';

/** Per-chat permission: run the agents' read-only workspace SQL without asking each time. */
export function SqlToggle({ checked, onChange, disabled = false }: {
  checked: boolean;
  onChange: (allowed: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useSettings();
  return (
    <label className="toggle" title={t('chat.allowSqlHint')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>{t('chat.allowSql')}</span>
    </label>
  );
}
