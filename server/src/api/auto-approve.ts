import type { ApprovalRequest } from '../runtime/events.ts';
import { isAutoApprovableSqlCall, isReadOnlySqlCall } from '../tools/kbagent/index.ts';
import type { AutoApprove } from './runs.ts';

const SQL_TOOL = 'kbagent_sql';

/**
 * Standing permissions the user can grant per chat. Today only SQL: when allowed, kbagent_sql
 * calls are approved if the kbagent policy maps them to an allowed workspace operation.
 * Listing or inspecting workspaces is a read in kbagent's own terms and never needs a human.
 */
export function createAutoApprover({ isSqlAllowed }: { isSqlAllowed: (threadId: string) => boolean }): AutoApprove {
  return (threadId: string, request: ApprovalRequest) =>
    request.tool === SQL_TOOL &&
    (isReadOnlySqlCall(request.args.args) || (isSqlAllowed(threadId) && isAutoApprovableSqlCall(request.args.args)));
}
