import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';

/** One reply of the scripted model: a message, or an error the call fails with. */
export type ScriptStep = AIMessage | Error;

/** Decides the next reply from the messages the agent sends; called once per model call. */
export type Script = (messages: readonly BaseMessage[], call: number) => ScriptStep | Promise<ScriptStep>;

/**
 * A chat model for graph tests: no network, every reply comes from a script. Tool binding is a no-op,
 * the script returns tool calls itself.
 */
export class ScriptedModel extends BaseChatModel {
  readonly script: Script;
  calls = 0;

  constructor(script: Script) {
    super({});
    this.script = script;
  }

  _llmType(): string {
    return 'scripted';
  }

  override bindTools(): this {
    return this;
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.calls += 1;
    const step = await this.script(messages, this.calls);
    if (step instanceof Error) throw step;
    return { generations: [{ text: typeof step.content === 'string' ? step.content : '', message: step }] };
  }
}

/** An AI message that calls one tool. */
export const toolCall = (name: string, args: Record<string, unknown>, id = `call-${name}`): AIMessage =>
  new AIMessage({ content: '', tool_calls: [{ id, name, args, type: 'tool_call' }] });
