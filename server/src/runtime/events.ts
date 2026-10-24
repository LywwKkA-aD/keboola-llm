/**
 * Turn raw LangGraph stream chunks ([namespace, mode, data] with subgraphs: true and
 * streamMode ['updates', 'messages']) into small UI events for the chat and the aquarium.
 */

export type TeamEvent =
  | { readonly type: 'token'; readonly agent: string; readonly text: string }
  | { readonly type: 'message'; readonly agent: string; readonly text: string }
  | { readonly type: 'tool.start'; readonly agent: string; readonly callId: string; readonly tool: string; readonly args: Readonly<Record<string, unknown>> }
  | { readonly type: 'tool.end'; readonly agent: string; readonly callId: string; readonly tool: string; readonly ok: boolean; readonly preview: string }
  | { readonly type: 'delegate.start'; readonly agent: string; readonly callId: string; readonly to: string; readonly task: string }
  | { readonly type: 'delegate.end'; readonly agent: string; readonly callId: string; readonly to: string; readonly ok: boolean }
  | { readonly type: 'approval.required'; readonly interruptId: string; readonly requests: readonly ApprovalRequest[] }
  // input counts every prompt token; cached of them were read from the provider's prompt cache, cacheWrite written to it.
  | { readonly type: 'usage'; readonly agent: string; readonly input: number; readonly output: number; readonly cached: number; readonly cacheWrite: number };

export interface ApprovalRequest {
  readonly tool: string;
  /** The agent whose pending call this is, when known. */
  readonly agent?: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly description?: string;
  readonly decisions: readonly string[];
}

interface CallInfo {
  readonly agent: string;
  readonly tool: string;
  readonly to?: string;
}

export interface MapperState {
  readonly lead: string;
  readonly calls: ReadonlyMap<string, CallInfo>;
  // With subgraphs: true an interrupt is emitted by the subgraph and again by every parent.
  readonly seenInterrupts: ReadonlySet<string>;
}

type Rec = Record<string, unknown>;

const PREVIEW_CHARS = 400;
const DELEGATION_TOOL = 'task';

const isRec = (value: unknown): value is Rec => typeof value === 'object' && value !== null;
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' ? value : 0);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const initialMapperState = (lead: string): MapperState => ({ lead, calls: new Map(), seenInterrupts: new Set() });

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  return list(content)
    .filter((block): block is Rec => isRec(block) && block.type === 'text')
    .map((block) => str(block.text))
    .join('');
}

const preview = (content: unknown): string => {
  const text = textOf(content);
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text;
};

function fromModelStep(state: MapperState, message: Rec): [MapperState, TeamEvent[]] {
  const agent = str(message.name) || state.lead;
  const usage = isRec(message.usage_metadata) ? message.usage_metadata : undefined;
  const details = usage && isRec(usage.input_token_details) ? usage.input_token_details : {};
  const usageEvents: TeamEvent[] = usage
    ? [{ type: 'usage', agent, input: num(usage.input_tokens), output: num(usage.output_tokens), cached: num(details.cache_read), cacheWrite: num(details.cache_creation) }]
    : [];

  const toolCalls = list(message.tool_calls).filter(isRec);
  if (toolCalls.length === 0) {
    const text = textOf(message.content);
    return [state, [...usageEvents, ...(text ? [{ type: 'message', agent, text } as const] : [])]];
  }

  const calls = toolCalls.map((call) => {
    const callId = str(call.id);
    const tool = str(call.name);
    const args = isRec(call.args) ? call.args : {};
    if (tool === DELEGATION_TOOL) {
      const to = str(args.subagent_type);
      return { callId, info: { agent, tool, to }, event: { type: 'delegate.start', agent, callId, to, task: str(args.description) } as const };
    }
    return { callId, info: { agent, tool }, event: { type: 'tool.start', agent, callId, tool, args } as const };
  });

  const nextCalls = new Map(state.calls);
  calls.forEach(({ callId, info }) => nextCalls.set(callId, info));
  return [{ ...state, calls: nextCalls }, [...usageEvents, ...calls.map((call) => call.event)]];
}

function fromToolResult(state: MapperState, message: Rec): TeamEvent[] {
  const callId = str(message.tool_call_id);
  const info = state.calls.get(callId);
  const ok = message.status !== 'error';
  const tool = info?.tool ?? str(message.name);
  const agent = info?.agent ?? state.lead;
  if (tool === DELEGATION_TOOL) return [{ type: 'delegate.end', agent, callId, to: info?.to ?? '', ok }];
  return [{ type: 'tool.end', agent, callId, tool, ok, preview: preview(message.content) }];
}

/** The agent that most recently called this tool: the interrupt itself does not say who asked. */
function callerOf(state: MapperState, tool: string): string | undefined {
  return [...state.calls.values()].toReversed().find((call) => call.tool === tool)?.agent;
}

function toRequests(state: MapperState, value: Rec): ApprovalRequest[] {
  const configs = list(value.reviewConfigs).filter(isRec);
  return list(value.actionRequests)
    .filter(isRec)
    .map((request): ApprovalRequest => {
      const tool = str(request.name);
      const config = configs.find((entry) => entry.actionName === tool);
      const agent = callerOf(state, tool);
      return {
        tool,
        ...(agent ? { agent } : {}),
        args: isRec(request.args) ? request.args : {},
        ...(request.description ? { description: str(request.description) } : {}),
        decisions: list(config?.allowedDecisions).map(str),
      };
    });
}

function fromInterrupt(state: MapperState, interrupts: unknown[]): [MapperState, TeamEvent[]] {
  return interrupts.filter(isRec).reduce<[MapperState, TeamEvent[]]>(
    ([current, events], interrupt) => {
      const value = isRec(interrupt.value) ? interrupt.value : {};
      const interruptId = str(interrupt.id) || JSON.stringify(value);
      const requests = toRequests(current, value);
      if (current.seenInterrupts.has(interruptId) || requests.length === 0) return [current, events];
      const next = { ...current, seenInterrupts: new Set(current.seenInterrupts).add(interruptId) };
      return [next, [...events, { type: 'approval.required', interruptId, requests }]];
    },
    [state, []],
  );
}

function fromUpdates(state: MapperState, data: Rec): [MapperState, TeamEvent[]] {
  return Object.entries(data).reduce<[MapperState, TeamEvent[]]>(
    ([current, events], [node, update]) => {
      if (node === '__interrupt__') {
        const [next, interruptEvents] = fromInterrupt(current, list(update));
        return [next, [...events, ...interruptEvents]];
      }
      if (!isRec(update)) return [current, events];
      const messages = list(update.messages).filter(isRec);
      if (node === 'model_request') {
        const last = messages.at(-1);
        if (!last) return [current, events];
        const [next, stepEvents] = fromModelStep(current, last);
        return [next, [...events, ...stepEvents]];
      }
      if (node === 'tools') return [current, [...events, ...messages.flatMap((message) => fromToolResult(current, message))]];
      return [current, events];
    },
    [state, []],
  );
}

// 'messages' mode streams tool results too; only model output is a token.
const isModelChunk = (chunk: Rec): boolean =>
  typeof chunk.getType === 'function' ? (chunk.getType as () => string)() === 'ai' : true;

function fromMessages(data: unknown): TeamEvent[] {
  const [chunk, metadata] = list(data);
  if (!isRec(chunk) || !isRec(metadata) || !isModelChunk(chunk)) return [];
  const text = textOf(chunk.content);
  const agent = str(metadata.lc_agent_name);
  return text && agent ? [{ type: 'token', agent, text }] : [];
}

/** Pure reducer: returns the next state and the events produced by one stream chunk. */
export function mapChunk(state: MapperState, chunk: unknown): [MapperState, TeamEvent[]] {
  const [, mode, data] = list(chunk);
  if (mode === 'messages') return [state, fromMessages(data)];
  if (mode === 'updates' && isRec(data)) return fromUpdates(state, data);
  return [state, []];
}

/** Convenience wrapper that keeps the reducer state between chunks of one run. */
export function createEventMapper(lead: string): (chunk: unknown) => TeamEvent[] {
  let state = initialMapperState(lead);
  return (chunk) => {
    const [next, events] = mapChunk(state, chunk);
    state = next;
    return events;
  };
}
