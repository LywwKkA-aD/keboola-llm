/**
 * Terminal chat with the agent team, for development.
 *   npm run chat                          interactive
 *   npm run chat -- "message"             one message
 *   npm run chat -- --raw "message"       dump raw stream chunks
 *   npm run chat -- --yes "message"       auto-approve every approval request
 */
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { inspect } from 'node:util';
import { Command } from '@langchain/langgraph';
import { bootstrap } from '../bootstrap.ts';
import { type Decision, type InterruptAnswer, toResumeValue } from '../runtime/approvals.ts';
import { type ApprovalRequest, createEventMapper, type TeamEvent } from '../runtime/events.ts';

const args = process.argv.slice(2);
const raw = args.includes('--raw');
const autoApprove = args.includes('--yes');
const oneShot = args.filter((arg) => !arg.startsWith('--')).join(' ');

const app = bootstrap();
app.loadErrors.forEach((error) => console.warn(`[load] ${error.file}: ${error.message}`));
const { spec, graph } = app.buildTeam(app.loadSettings());
spec.warnings.forEach((warning) => console.warn(`[team] ${warning}`));
console.log(`Team: ${spec.lead.name} + ${spec.subagents.map((agent) => agent.name).join(', ') || 'no subagents'}`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const threadId = randomUUID();
const dim = (text: string) => `\x1b[2m${text}\x1b[0m`;

function render(event: TeamEvent): void {
  switch (event.type) {
    case 'token':
      if (event.agent === spec.lead.name) process.stdout.write(event.text);
      return;
    case 'delegate.start':
      console.log(dim(`\n  [${event.agent} -> ${event.to}] ${event.task.slice(0, 120)}`));
      return;
    case 'delegate.end':
      console.log(dim(`  [${event.to} done${event.ok ? '' : ', failed'}]`));
      return;
    case 'tool.start':
      console.log(dim(`  [${event.agent}] ${event.tool} ${JSON.stringify(event.args).slice(0, 120)}`));
      return;
    case 'tool.end':
      if (!event.ok) console.log(dim(`  [${event.agent}] ${event.tool} failed: ${event.preview.slice(0, 160)}`));
      return;
    case 'usage':
      console.log(dim(`  (${event.agent}: in ${event.input}, cached ${event.cached}, out ${event.output})`));
      return;
    default:
      return;
  }
}

async function decide(requests: readonly ApprovalRequest[]): Promise<Decision[]> {
  const decisions: Decision[] = [];
  for (const request of requests) {
    console.log(`\nApproval needed: ${request.tool}\n${inspect(request.args, { depth: 4, maxStringLength: 2000 })}`);
    const answer = autoApprove ? 'y' : (await rl.question('approve? [y/N] ')).trim().toLowerCase();
    decisions.push(answer === 'y' ? { type: 'approve' } : { type: 'reject', message: 'The user rejected this action.' });
  }
  return decisions;
}

async function answerAll(pending: readonly PendingApproval[]): Promise<InterruptAnswer[]> {
  const answers: InterruptAnswer[] = [];
  for (const { interruptId, requests } of pending) answers.push({ interruptId, decisions: await decide(requests) });
  return answers;
}

type PendingApproval = Extract<TeamEvent, { type: 'approval.required' }>;

async function run(input: unknown): Promise<void> {
  const mapEvents = createEventMapper(spec.lead.name);
  const stream = await graph.stream(input as never, {
    configurable: { thread_id: threadId },
    streamMode: ['updates', 'messages'],
    subgraphs: true,
    recursionLimit: 200,
  });
  const pending: PendingApproval[] = [];
  for await (const chunk of stream) {
    if (raw) console.log(inspect(chunk, { depth: 5, breakLength: 160, maxStringLength: 300 }));
    mapEvents(chunk).forEach((event) => {
      if (event.type === 'approval.required') pending.push(event);
      else if (!raw) render(event);
    });
  }
  process.stdout.write('\n');
  if (pending.length) await run(new Command({ resume: toResumeValue(await answerAll(pending)) }));
}

const send = (text: string) => run({ messages: [{ role: 'user', content: text }] });

if (oneShot) {
  await send(oneShot);
} else {
  for (;;) {
    const line = (await rl.question('\nyou> ')).trim();
    if (!line || line === '/exit') break;
    await send(line);
  }
}
rl.close();
