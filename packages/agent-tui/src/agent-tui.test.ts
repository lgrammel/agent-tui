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
        messages: [{ role: "user", content: "hello" }],
      },
    ]);
    expect(renderer.submittedPrompts).toEqual(["hello"]);
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
        messages: [{ role: "user", content: "first" }],
      },
      {
        messages: [
          { role: "user", content: "first" },
          { role: "assistant", content: "response to first" },
          { role: "user", content: "second" },
        ],
      },
    ]);
    expect(renderer.submittedPrompts).toEqual(["first", "second"]);
  });

  it("collects assistant text after tool calls in a multi-step stream", async () => {
    const streamCalls: AgentTUIStreamOptions[] = [];
    const renderer = createRenderer({
      prompts: ["next", undefined],
    });
    const agent = createMultiStepAgent(streamCalls);

    await new AgentTUI(agent, { renderer }).run({ prompt: "weather" });

    expect(streamCalls).toEqual([
      {
        messages: [{ role: "user", content: "weather" }],
      },
      {
        messages: [
          { role: "user", content: "weather" },
          { role: "assistant", content: "Berlin is snowy and 72F." },
          { role: "user", content: "next" },
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
    stream(options: AgentTUIStreamOptions) {
      streamCalls.push(options);

      return {
        fullStream: createStream(`response to ${lastUserMessage(options).content}`),
      };
    },
  };
}

function createMultiStepAgent(streamCalls: AgentTUIStreamOptions[]): AgentTUIAgent {
  return {
    stream(options: AgentTUIStreamOptions) {
      streamCalls.push(options);

      return {
        fullStream: createMultiStepStream(),
      };
    },
  };
}

type TestRenderer = AgentTUIRenderer & { submittedPrompts: string[] };

function createRenderer(options: { prompts: Array<string | undefined> }): TestRenderer {
  const submittedPrompts: string[] = [];

  return {
    submittedPrompts,
    async readPrompt() {
      return options.prompts.shift();
    },
    async renderStream(result, sessionOptions) {
      if (sessionOptions?.submittedPrompt) {
        submittedPrompts.push(sessionOptions.submittedPrompt);
      }

      for await (const _part of result.fullStream) {
        // Drain the stream so AgentTUI can collect assistant text.
      }

      return undefined;
    },
  };
}

function createStream(text: string): AsyncIterable<AgentTUIStreamPart> {
  return (async function* () {
    yield { type: "text-delta", id: "text-1", text };
  })();
}

function lastUserMessage(options: AgentTUIStreamOptions) {
  const message = options.messages.findLast((message) => message.role === "user");

  if (!message) {
    throw new Error("Expected at least one user message.");
  }

  return message;
}

function createMultiStepStream(): AsyncIterable<AgentTUIStreamPart> {
  return (async function* () {
    yield {
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "weather",
      input: { city: "Berlin" },
    } as AgentTUIStreamPart;
    yield {
      type: "tool-result",
      toolCallId: "call-1",
      toolName: "weather",
      input: { city: "Berlin" },
      output: { city: "Berlin", temperature: 72, weather: "snowy" },
    } as AgentTUIStreamPart;
    yield { type: "text-delta", id: "text-1", text: "Berlin is snowy and 72F." };
  })();
}
