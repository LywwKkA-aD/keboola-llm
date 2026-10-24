import { useSettings } from '../../state/settings-context.tsx';
import { SettingsSection } from '../settings/fields.tsx';
import { SetupChecklist } from './SetupChecklist.tsx';
import { useSetup } from './useSetup.ts';

/** Settings: the setup checklist, always there to check or change things later (Home shows it while a step fails). */
export function SetupSection() {
  const { t } = useSettings();
  const setup = useSetup();
  return (
    <SettingsSection title={t('setup.section')} hint={t('setup.intro')}>
      <SetupChecklist setup={setup} />
    </SettingsSection>
  );
}
