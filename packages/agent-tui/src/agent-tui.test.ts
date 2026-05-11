import { describe, expect, it } from "vitest";
import {
  AgentTUI,
  type AgentTUIAgent,
  type AgentTUIRenderer,
  type AgentTUIStreamOptions,
  type AgentTUIStreamPart,
} from "./agent-tui";

describe("AgentTUI", () => {
  it("prompts before the first turn when the initial prompt is omitted", async () => {
    const streamCalls: AgentTUIStreamOptions[] = [];
    const renderer = createRenderer({
      prompts: ["hello", undefined],
    });
    const agent = createAgent(streamCalls);

    await new AgentTUI(agent, { renderer }).run();

    expect(streamCalls).toEqual([
      {
        prompt: "hello",
        messages: [{ role: "user", content: "hello" }],
      },
    ]);
  });

  it("continues prompting after the initial prompt and passes message history", async () => {
    const streamCalls: AgentTUIStreamOptions[] = [];
    const renderer = createRenderer({
      prompts: ["second", undefined],
    });
    const agent = createAgent(streamCalls);

    await new AgentTUI(agent, { renderer }).run({ prompt: "first" });

    expect(streamCalls).toEqual([
      {
        prompt: "first",
        messages: [{ role: "user", content: "first" }],
      },
      {
        prompt: "second",
        messages: [
          { role: "user", content: "first" },
          { role: "assistant", content: "response to first" },
          { role: "user", content: "second" },
        ],
      },
    ]);
  });

  it("exits when prompt input is interrupted", async () => {
    const streamCalls: AgentTUIStreamOptions[] = [];
    const renderer: AgentTUIRenderer = {
      async readPrompt() {
        throw new Error("Interrupted");
      },
      async renderStream() {
        throw new Error("Expected no stream to render.");
      },
    };
    const agent = createAgent(streamCalls);

    await new AgentTUI(agent, { renderer }).run();

    expect(streamCalls).toEqual([]);
  });
});

function createAgent(streamCalls: AgentTUIStreamOptions[]): AgentTUIAgent {
  return {
    stream(options) {
      streamCalls.push(options);

      return {
        fullStream: createStream(`response to ${options.prompt}`),
      };
    },
  };
}

function createRenderer(options: { prompts: Array<string | undefined> }): AgentTUIRenderer {
  return {
    async readPrompt() {
      return options.prompts.shift();
    },
    async renderStream(result) {
      for await (const _part of result.fullStream) {
        // Drain the stream so AgentTUI can collect assistant text.
      }

      return undefined;
    },
  };
}

function createStream(text: string): AsyncIterable<AgentTUIStreamPart> {
  return (async function* () {
    yield { type: "text-delta", text };
  })();
}
