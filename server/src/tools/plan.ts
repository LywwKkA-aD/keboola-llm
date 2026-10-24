import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const PLAN_TOOL = 'request_plan_approval';

const DESCRIPTION = `Ask the user to approve a plan before anything in Keboola changes. The plan appears in the chat with Approve and Reject buttons and this call waits for the answer: approved means go ahead as written; a rejection comes back with the user's reason. Write the plan in the user's language, in Markdown: what changes where (config names and ids), the expected effect on the data, and that the work runs on a development branch, asks before every write and ends with a promotion to production the user approves in the app.`;

/** The lead's way to agree a plan with the user: it runs only once the user approved it in the UI. */
export function createPlanApprovalTool() {
  return tool(async ({ title }) => `The user approved the plan "${title}". Carry it out as written; ask again only if it has to change.`, {
    name: PLAN_TOOL,
    description: DESCRIPTION,
    schema: z.object({
      title: z.string().min(3).max(120).describe('Short name of the change, in the user language'),
      plan: z.string().min(10).max(6000).describe('The plan in Markdown, in the user language'),
    }),
  });
}
