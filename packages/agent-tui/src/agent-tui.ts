import { TerminalRenderer } from "./tui/terminal-renderer";

export type AgentTUIStreamPart =
  | { type: "text-delta"; text: string }
  | { type: "reasoning-start" }
  | { type: "reasoning-delta"; text: string }
  | { type: "reasoning-end" }
  | { type: "tool-call"; [key: string]: unknown }
  | { type: "tool-result"; [key: string]: unknown };

export type AgentTUIStreamResult = {
  fullStream: AsyncIterable<AgentTUIStreamPart>;
};

export type AgentTUIAgent = {
  stream(options: { prompt: string }): Promise<AgentTUIStreamResult> | AgentTUIStreamResult;
};

export type AgentTUIRenderer = {
  readPrompt?(options?: AgentTUISessionOptions): Promise<string>;
  renderStream(result: AgentTUIStreamResult, options?: AgentTUISessionOptions): Promise<void>;
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

export class AgentTUI<TAgent extends AgentTUIAgent = AgentTUIAgent> {
  readonly #agent: TAgent;
  readonly #renderer: AgentTUIRenderer;
  readonly #title?: string;

  constructor(agent: TAgent, options?: AgentTUIOptions) {
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
