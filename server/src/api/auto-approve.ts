import type { ApprovalRequest } from '../runtime/events.ts';
import { isAutoApprovableSqlCall } from '../tools/kbagent/index.ts';
import type { AutoApprove } from './runs.ts';

const SQL_TOOL = 'kbagent_sql';

/**
 * Standing permissions the user can grant per chat. Today only SQL: when allowed, kbagent_sql
 * calls are approved if the kbagent policy maps them to an allowed workspace operation.
 */
export function createAutoApprover({ isSqlAllowed }: { isSqlAllowed: (threadId: string) => boolean }): AutoApprove {
  return (threadId: string, request: ApprovalRequest) =>
    request.tool === SQL_TOOL && isSqlAllowed(threadId) && isAutoApprovableSqlCall(request.args.args);
}
