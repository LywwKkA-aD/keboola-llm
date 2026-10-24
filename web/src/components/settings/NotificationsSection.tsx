import type { Settings } from '../../api/types.ts';
import { useNotifyPermission } from '../../attention/useNotifyPermission.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { SettingsSection } from './fields.tsx';

/**
 * Desktop notifications: the stored switch plus this browser's permission. The switch shows on only when
 * both agree, so a browser that was never asked (or blocks them) shows it off.
 */
export function NotificationsSection({ onSave }: { onSave: (patch: Partial<Settings>) => Promise<void> }) {
  const { t, settings } = useSettings();
  const [permission, ask] = useNotifyPermission();
  const on = settings.desktopNotifications && permission === 'granted';

  const toggle = async (checked: boolean) => {
    if (!checked) return onSave({ desktopNotifications: false });
    if ((await ask()) === 'granted') return onSave({ desktopNotifications: true });
    return undefined;
  };

  return (
    <SettingsSection title={t('settings.notifications')} hint={t('settings.notificationsHint')}>
      <label className="toggle">
        <input type="checkbox" checked={on} disabled={permission === 'unsupported'} onChange={(event) => void toggle(event.target.checked)} />
        <span>{t('settings.notify')}</span>
      </label>
      {permission === 'denied' && (
        <span className="field__error" role="status">
          {t('settings.notifyBlocked')}
        </span>
      )}
      {permission === 'unsupported' && <span className="muted">{t('settings.notifyUnsupported')}</span>}
    </SettingsSection>
  );
}
