import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentTUIRenderer } from "./agent-tui";

let testRenderer: AgentTUIRenderer | undefined;

vi.mock("./tui/terminal-renderer", () => ({
  TerminalRenderer: vi.fn(() => {
    if (!testRenderer) {
      throw new Error("Expected a test renderer.");
    }

    return testRenderer;
  }),
}));

import {
  AgentTUI,
  type AgentTUIAgent,
  type AgentTUIStreamOptions,
} from "./agent-tui";
import {
  readUIMessageStream,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

describe("AgentTUI", () => {
  beforeEach(() => {
    testRenderer = undefined;
  });

  it("prompts before the first turn when the initial prompt is omitted", async () => {
    const streamCalls: AgentTUIStreamOptions[] = [];
    const renderer = useRenderer(createRenderer({
      prompts: ["hello", undefined],
    }));
    const agent = createAgent(streamCalls);

    await new AgentTUI(agent).run();

    expect(streamCalls).toEqual([
      {
        messages: [createUserMessage("message-1", "hello")],
      },
    ]);
    expect(renderer.submittedPrompts).toEqual(["hello"]);
  });

  it("continues prompting after the initial prompt and passes message history", async () => {
    const streamCalls: AgentTUIStreamOptions[] = [];
    const renderer = useRenderer(createRenderer({
      prompts: ["second", undefined],
    }));
    const agent = createAgent(streamCalls);

    await new AgentTUI(agent).run({ prompt: "first" });

    expect(streamCalls).toEqual([
      {
        messages: [createUserMessage("message-1", "first")],
      },
      {
        messages: [
          createUserMessage("message-1", "first"),
          createAssistantMessage("message-2", "response to first"),
          createUserMessage("message-3", "second"),
        ],
      },
    ]);
    expect(renderer.submittedPrompts).toEqual(["first", "second"]);
  });

  it("collects assistant text after tool calls in a multi-step stream", async () => {
    const streamCalls: AgentTUIStreamOptions[] = [];
    useRenderer(createRenderer({
      prompts: ["next", undefined],
    }));
    const agent = createMultiStepAgent(streamCalls);

    await new AgentTUI(agent).run({ prompt: "weather" });

    expect(streamCalls).toEqual([
      {
        messages: [createUserMessage("message-1", "weather")],
      },
      {
        messages: [
          createUserMessage("message-1", "weather"),
          createAssistantMessageWithToolInvocation("message-2"),
          createUserMessage("message-3", "next"),
        ],
      },
    ]);
  });

  it("exits when prompt input is interrupted", async () => {
    const streamCalls: AgentTUIStreamOptions[] = [];
    useRenderer({
      async readPrompt() {
        throw new Error("Interrupted");
      },
      async renderStream() {
        throw new Error("Expected no stream to render.");
      },
    });
    const agent = createAgent(streamCalls);

    await new AgentTUI(agent).run();

    expect(streamCalls).toEqual([]);
  });
});

function createAgent(streamCalls: AgentTUIStreamOptions[]): AgentTUIAgent {
  return {
    stream(options: AgentTUIStreamOptions) {
      streamCalls.push(options);

      return {
        fullStream: createStream(`response to ${messageText(lastUserMessage(options))}`),
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

function useRenderer<TRenderer extends AgentTUIRenderer>(renderer: TRenderer): TRenderer {
  testRenderer = renderer;

  return renderer;
}

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

      let responseMessage: UIMessage | undefined;

      for await (const message of readUIMessageStream({
        stream: toReadableStream(result.uiMessageStream),
      })) {
        responseMessage = message;
      }

      return responseMessage;
    },
  };
}

function createStream(text: string): AsyncIterable<TextStreamPart<ToolSet>> {
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

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function createUserMessage(id: string, text: string): UIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function createAssistantMessage(id: string, text: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text, state: "done" }],
  };
}

function createAssistantMessageWithToolInvocation(id: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [
      {
        type: "tool-weather",
        toolCallId: "call-1",
        state: "output-available",
        input: { city: "Berlin" },
        output: { city: "Berlin", temperature: 72, weather: "snowy" },
      },
      { type: "text", text: "Berlin is snowy and 72F.", state: "done" },
    ],
  };
}

function toReadableStream(
  stream: AsyncIterable<UIMessageChunk> | ReadableStream<UIMessageChunk>,
): ReadableStream<UIMessageChunk> {
  if (stream instanceof ReadableStream) {
    return stream;
  }

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function createMultiStepStream(): AsyncIterable<TextStreamPart<ToolSet>> {
  return (async function* () {
    yield {
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "weather",
      input: { city: "Berlin" },
    } as TextStreamPart<ToolSet>;
    yield {
      type: "tool-result",
      toolCallId: "call-1",
      toolName: "weather",
      input: { city: "Berlin" },
      output: { city: "Berlin", temperature: 72, weather: "snowy" },
    } as TextStreamPart<ToolSet>;
    yield { type: "text-delta", id: "text-1", text: "Berlin is snowy and 72F." };
  })();
}
