import type { ApprovalRequest } from '../../api/types.ts';
import type { StringKey } from '../../i18n/strings.ts';
import { Markdown } from '../Markdown.tsx';
import { PromotionDetails } from './PromotionDetails.tsx';

/** The lead's request to approve a plan (server/src/tools/plan.ts). */
export const PLAN_TOOL = 'request_plan_approval';
/** A configuration going from a development branch to production (server/src/tools/kbagent/promote.ts). */
export const PROMOTE_TOOL = 'kbagent_promote';

const LABELS: Readonly<Record<string, StringKey>> = { [PLAN_TOOL]: 'approval.plan', [PROMOTE_TOOL]: 'approval.promote' };

/** What to call a request in lists: a plain name for the plan and the promotion, the tool name otherwise. */
export const requestLabel = (request: ApprovalRequest, t: (key: StringKey) => string) => {
  const key = LABELS[request.tool];
  return key ? t(key) : request.tool;
};

/** What an approval would do: the plan, the file to write, the kbagent command, or the raw arguments. */
export function RequestDetails({ request, compact = false }: { request: ApprovalRequest; compact?: boolean }) {
  const { args } = request;
  if (request.tool === PROMOTE_TOOL) return <PromotionDetails request={request} compact={compact} />;
  if (request.tool === PLAN_TOOL && typeof args.plan === 'string') {
    return (
      <div className="request request--plan">
        {typeof args.title === 'string' && <div className="request__purpose request__title">{args.title}</div>}
        {!compact && <Markdown className="message__markdown" text={args.plan} />}
      </div>
    );
  }
  if (typeof args.file_path === 'string') {
    const body = typeof args.content === 'string' ? args.content : typeof args.new_string === 'string' ? args.new_string : '';
    return (
      <div className="request">
        <div className="request__target mono">{args.file_path}</div>
        {!compact && body && <pre className="request__code">{body}</pre>}
      </div>
    );
  }
  if (Array.isArray(args.args)) {
    return (
      <div className="request">
        {typeof args.purpose === 'string' && <div className="request__purpose">{args.purpose}</div>}
        <pre className="request__code">kbagent {args.args.join(' ')}</pre>
      </div>
    );
  }
  return compact ? null : <pre className="request__code">{JSON.stringify(args, null, 2)}</pre>;
}
