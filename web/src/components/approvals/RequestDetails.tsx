import type { ApprovalRequest } from '../../api/types.ts';
import type { StringKey } from '../../i18n/strings.ts';
import { Markdown } from '../Markdown.tsx';

/** The lead's request to approve a plan (server/src/tools/plan.ts). */
export const PLAN_TOOL = 'request_plan_approval';

/** What to call a request in lists: a plain name for the plan, the tool name otherwise. */
export const requestLabel = (request: ApprovalRequest, t: (key: StringKey) => string) => (request.tool === PLAN_TOOL ? t('approval.plan') : request.tool);

/** What an approval would do: the plan, the file to write, the kbagent command, or the raw arguments. */
export function RequestDetails({ request, compact = false }: { request: ApprovalRequest; compact?: boolean }) {
  const { args } = request;
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
