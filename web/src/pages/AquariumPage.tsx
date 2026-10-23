import { useSettings } from '../state/settings-context.tsx';

export function AquariumPage() {
  const { t } = useSettings();
  return (
    <div className="page">
      <h1 className="page__title">{t('nav.aquarium')}</h1>
      <p>{t('aquarium.soon')}</p>
    </div>
  );
}
