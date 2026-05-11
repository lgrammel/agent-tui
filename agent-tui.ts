import { printStream } from "@/util/print-stream";
import type { Agent, StreamTextResult, ToolSet } from "ai";

export type AgentTUIRenderer = {
  renderStream(result: StreamTextResult<any, any>): Promise<void>;
};

export type AgentTUIOptions = {
  renderer?: AgentTUIRenderer;
};

export type AgentTUIRunOptions = {
  prompt: string;
};

export class AgentTUI<TTools extends ToolSet = ToolSet, TOutput = unknown, TContext = unknown> {
  readonly #agent: Agent<TTools, TOutput, TContext>;
  readonly #renderer: AgentTUIRenderer;

  constructor(agent: Agent<TTools, TOutput, TContext>, options?: AgentTUIOptions) {
    this.#agent = agent;
    this.#renderer = options?.renderer ?? defaultRenderer;
  }

  async run(options: AgentTUIRunOptions) {
    const result = this.#agent.stream({ prompt: options.prompt });

    await this.#renderer.renderStream(result);
  }
}

const defaultRenderer: AgentTUIRenderer = {
  async renderStream(result) {
    await printStream(result);
  },
};
