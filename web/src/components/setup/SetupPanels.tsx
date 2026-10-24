import { useId } from 'react';
import { useSettings } from '../../state/settings-context.tsx';
import { SettingsSection } from '../settings/fields.tsx';
import { SetupChecklist } from './SetupChecklist.tsx';
import { type SetupState, useSetup } from './useSetup.ts';

/** Home, right panel: the checklist while a step still fails. */
export function SetupCard({ setup }: { setup: SetupState }) {
  const { t } = useSettings();
  const titleId = useId();
  return (
    <section className="panel-section setup-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="setup-card__title">
        {t('setup.title')}
      </h2>
      <p className="setup-card__intro">{t('setup.intro')}</p>
      <SetupChecklist setup={setup} />
    </section>
  );
}

/** Settings: the same checklist, always there to check or change things later. */
export function SetupSection() {
  const { t } = useSettings();
  const setup = useSetup();
  return (
    <SettingsSection title={t('setup.section')} hint={t('setup.intro')}>
      <SetupChecklist setup={setup} />
    </SettingsSection>
  );
}
