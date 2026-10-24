import { useEffect, useState } from 'react';
import { request } from '../../api/client.ts';
import type { ApprovalRequest } from '../../api/types.ts';
import { useSettings } from '../../state/settings-context.tsx';
import { DiffView } from '../versions/DiffView.tsx';
import '../versions/versions.css';

interface Preview {
  readonly productionVersion?: number;
  readonly production: string;
  readonly branch: string;
}

/** A promotion to production: what changes, as production now against the branch it comes from. */
export function PromotionDetails({ request: { args }, compact }: { request: ApprovalRequest; compact: boolean }) {
  const { t } = useSettings();
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState<string>();
  const ids = [args.component_id, args.config_id, args.branch_id].map(String);

  useEffect(() => {
    if (compact) return undefined;
    let current = true;
    const [componentId, configId, branchId] = ids;
    const query = new URLSearchParams({ componentId: componentId ?? '', configId: configId ?? '', branchId: branchId ?? '' });
    request<Preview>(`/api/promotions/preview?${query.toString()}`).then(
      (loaded) => current && setPreview(loaded),
      (reason: unknown) => current && setError(reason instanceof Error ? reason.message : t('error.generic')),
    );
    return () => {
      current = false;
    };
    // The ids identify the promotion; they do not change for one card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, ids.join('/')]);

  return (
    <div className="request request--promotion">
      {typeof args.summary === 'string' && <div className="request__purpose request__title">{args.summary}</div>}
      <div className="request__target mono">
        {ids[0]} · {ids[1]} · {t('approval.fromBranch').replace('{branch}', ids[2] ?? '')}
      </div>
      {!compact && error && <div className="error-banner">{error}</div>}
      {!compact && !error && !preview && <p className="empty">{t('approval.promoteLoading')}</p>}
      {!compact && preview && <DiffView before={preview.production} after={preview.branch} label={t('approval.promoteDiff')} />}
    </div>
  );
}
