/**
 * Terminal chat with the agent team, for development.
 *   npm run chat                     interactive
 *   npm run chat -- --raw "message"  one message, dump raw stream chunks
 */
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { inspect } from 'node:util';
import { bootstrap } from '../bootstrap.ts';

const args = process.argv.slice(2);
const raw = args.includes('--raw');
const oneShot = args.filter((arg) => !arg.startsWith('--')).join(' ');

const app = bootstrap();
app.loadErrors.forEach((error) => console.warn(`[load] ${error.file}: ${error.message}`));
const { spec, graph } = app.buildTeam(app.loadSettings());
spec.warnings.forEach((warning) => console.warn(`[team] ${warning}`));
console.log(`Team: ${spec.lead.name} + ${spec.subagents.map((agent) => agent.name).join(', ') || 'no subagents'}`);

const threadId = randomUUID();

async function send(text: string): Promise<void> {
  const stream = await graph.stream(
    { messages: [{ role: 'user', content: text }] },
    { configurable: { thread_id: threadId }, streamMode: ['updates', 'messages'], subgraphs: true, recursionLimit: 200 },
  );
  for await (const chunk of stream) {
    if (raw) {
      console.log(inspect(chunk, { depth: 5, breakLength: 160, maxStringLength: 300 }));
      continue;
    }
    const [namespace, mode, data] = chunk as [string[], string, unknown];
    if (mode === 'messages' && namespace.length === 0) {
      const [message] = data as [{ content?: unknown }];
      if (typeof message.content === 'string') process.stdout.write(message.content);
    }
  }
  process.stdout.write('\n');
}

if (oneShot) {
  await send(oneShot);
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const line = (await rl.question('\nyou> ')).trim();
    if (!line || line === '/exit') break;
    await send(line);
  }
  rl.close();
}
