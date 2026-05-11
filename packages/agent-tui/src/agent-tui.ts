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

export type AgentTUIMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentTUIStreamOptions = {
  prompt: string;
  messages: AgentTUIMessage[];
};

export type AgentTUIAgent = {
  stream(options: AgentTUIStreamOptions): Promise<AgentTUIStreamResult> | AgentTUIStreamResult;
};

export type AgentTUIRenderer = {
  readPrompt?(options?: AgentTUISessionOptions): Promise<string | undefined>;
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
  waitForExit?: boolean;
  continueSession?: boolean;
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
    const messages: AgentTUIMessage[] = [];
    let prompt = options?.prompt;
    let hasRunTurn = false;

    while (true) {
      if (prompt == null) {
        if (!this.#renderer.readPrompt) {
          if (hasRunTurn) {
            return;
          }

          throw new Error("No prompt was provided and the renderer does not support prompt input.");
        }

        try {
          prompt = await this.#renderer.readPrompt({ title });
        } catch (error) {
          if (isInterruptedError(error)) {
            return;
          }

          throw error;
        }

        if (prompt == null) {
          return;
        }
      }

      messages.push({ role: "user", content: prompt });
      hasRunTurn = true;

      const result = await this.#agent.stream({
        prompt,
        messages: [...messages],
      });
      const responseParts: string[] = [];

      try {
        await this.#renderer.renderStream(
          {
            ...result,
            fullStream: collectAssistantText(result.fullStream, responseParts),
          },
          {
            title,
            continueSession: Boolean(this.#renderer.readPrompt),
            waitForExit: false,
          },
        );
      } catch (error) {
        if (isInterruptedError(error)) {
          return;
        }

        throw error;
      }

      const response = responseParts.join("");

      if (response.length > 0) {
        messages.push({ role: "assistant", content: response });
      }

      prompt = undefined;
    }
  }
}

const defaultRenderer: AgentTUIRenderer = new TerminalRenderer();

async function* collectAssistantText(
  stream: AsyncIterable<AgentTUIStreamPart>,
  responseParts: string[],
): AsyncIterable<AgentTUIStreamPart> {
  for await (const part of stream) {
    if (part.type === "text-delta") {
      responseParts.push(part.text);
    }

    yield part;
  }
}

function isInterruptedError(error: unknown) {
  return error instanceof Error && error.message === "Interrupted";
}
