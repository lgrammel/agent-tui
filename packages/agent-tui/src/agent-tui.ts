import { TerminalRenderer } from "./tui/terminal-renderer";
import type { Agent, StreamTextResult, ToolSet } from "ai";

export type AgentTUIRenderer = {
  readPrompt?(options?: AgentTUISessionOptions): Promise<string>;
  renderStream(
    result: StreamTextResult<any, any, any>,
    options?: AgentTUISessionOptions,
  ): Promise<void>;
};

export type AgentTUIOptions = {
  renderer?: AgentTUIRenderer;
  title?: string;
};

export type AgentTUIRunOptions = {
  prompt?: string;
  title?: string;
};

export type AgentTUISessionOptions = {
  title?: string;
  initialPrompt?: string;
};

export class AgentTUI<TOutput = unknown, TTools extends ToolSet = ToolSet> {
  readonly #agent: Agent<TOutput, TTools, any>;
  readonly #renderer: AgentTUIRenderer;
  readonly #title?: string;

  constructor(agent: Agent<TOutput, TTools, any>, options?: AgentTUIOptions) {
    this.#agent = agent;
    this.#renderer = options?.renderer ?? defaultRenderer;
    this.#title = options?.title;
  }

  async run(options?: AgentTUIRunOptions) {
    const title = options?.title ?? this.#title ?? "Agent TUI";
    const prompt =
      options?.prompt ??
      (await this.#renderer.readPrompt?.({
        title,
      }));

    if (prompt == null) {
      throw new Error("No prompt was provided and the renderer does not support prompt input.");
    }

    const result = await this.#agent.stream({ prompt });

    await this.#renderer.renderStream(result, { title });
  }
}

const defaultRenderer: AgentTUIRenderer = new TerminalRenderer();
