import type { ApprovalRequest } from '../../api/types.ts';

/** What an approval would do: the file to write, the kbagent command, or the raw arguments. */
export function RequestDetails({ request, compact = false }: { request: ApprovalRequest; compact?: boolean }) {
  const { args } = request;
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
