import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentTUIAgent,
  AgentTUIRenderer,
  AgentTUIStreamOptions,
  AgentTUIToolApprovalRequest,
  AgentTUIToolApprovalResponse,
} from "./agent-tui-runner";

let testRenderer: AgentTUIRenderer | undefined;
let terminalRendererOptions: unknown[] = [];

vi.mock("./tui/terminal-renderer", () => ({
  TerminalRenderer: vi.fn(function TerminalRenderer(options) {
    terminalRendererOptions.push(options);

    if (!testRenderer) {
      throw new Error("Expected a test renderer.");
    }

    return testRenderer;
  }),
}));

import { runAgentTUI } from "./run-agent-tui";
import { AgentTUIRunner } from "./agent-tui-runner";
import {
  readUIMessageStream,
  type Agent,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

describe("runAgentTUI", () => {
  beforeEach(() => {
    testRenderer = undefined;
    terminalRendererOptions = [];
  });

  it("creates the default terminal renderer when none is provided", async () => {
    useRenderer(
      createRenderer({
        prompts: [undefined],
      }),
    );
    const agent = createAISDKAgent();

    await runAgentTUI({ agent, name: "Test Agent" });

    expect(terminalRendererOptions).toEqual([undefined]);
  });

  it("passes collapseTools to the default terminal renderer", async () => {
    useRenderer(
      createRenderer({
        prompts: [undefined],
      }),
    );
    const agent = createAISDKAgent();

    await runAgentTUI({ agent, name: "Test Agent", collapseTools: true });

    expect(terminalRendererOptions).toEqual([{ collapseTools: true }]);
  });
});

describe("AgentTUIRunner", () => {
  beforeEach(() => {
    testRenderer = undefined;
    terminalRendererOptions = [];
  });

  it("prompts before the first turn", async () => {
    const streamCalls: AgentTUIStreamOptions[] = [];
    const renderer = useRenderer(
      createRenderer({
        prompts: ["hello", undefined],
      }),
    );
    const agent = createAgent(streamCalls);

    await new AgentTUIRunner({ agent, name: "Test Agent" }).run();

    expect(streamCalls).toEqual([
      {
        messages: [createUserMessage("message-1", "hello")],
      },
    ]);
    expect(renderer.submittedPrompts).toEqual(["hello"]);
  });

  it("continues prompting and passes message history", async () => {
    const streamCalls: AgentTUIStreamOptions[] = [];
    const renderer = useRenderer(
      createRenderer({
        prompts: ["first", "second", undefined],
      }),
    );
    const agent = createAgent(streamCalls);

    await new AgentTUIRunner({ agent, name: "Test Agent" }).run();

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
    useRenderer(
      createRenderer({
        prompts: ["weather", "next", undefined],
      }),
    );
    const agent = createMultiStepAgent(streamCalls);

    await new AgentTUIRunner({ agent, name: "Test Agent" }).run();

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

  it("continues the turn with a tool approval response", async () => {
    const streamCalls: AgentTUIStreamOptions[] = [];
    const renderer = useRenderer(
      createRenderer({
        prompts: ["run command", undefined],
        toolApprovals: [{ approved: true }],
      }),
    );
    const agent = createApprovalAgent(streamCalls);

    await new AgentTUIRunner({ agent, name: "Test Agent" }).run();

    expect(streamCalls).toEqual([
      {
        messages: [createUserMessage("message-1", "run command")],
      },
      {
        messages: [
          createUserMessage("message-1", "run command"),
          createAssistantMessageWithToolApproval("message-2", true),
        ],
      },
    ]);
    expect(renderer.toolApprovalRequests).toEqual([
      expect.objectContaining({
        approvalId: "approval-1",
        toolCallId: "call-1",
        toolName: "shell",
        input: { command: "date" },
        messageId: "message-2",
        partIndex: 0,
      }),
    ]);
    expect(renderer.submittedPrompts).toEqual(["run command"]);
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

    await new AgentTUIRunner({ agent, name: "Test Agent" }).run();

    expect(streamCalls).toEqual([]);
  });

  it("uses the provided name as the session title", async () => {
    const streamCalls: AgentTUIStreamOptions[] = [];
    const renderer = useRenderer(
      createRenderer({
        prompts: ["hello", undefined],
      }),
    );
    const agent = createAgent(streamCalls);

    await new AgentTUIRunner({ agent, name: "Test Agent" }).run();

    expect(terminalRendererOptions).toEqual([undefined]);
    expect(renderer.submittedPrompts).toEqual(["hello"]);
    expect(renderer.titles).toEqual(["Test Agent", "Test Agent", "Test Agent"]);
  });
  it("accepts an injected renderer", async () => {
    const streamCalls: AgentTUIStreamOptions[] = [];
    const renderer = createRenderer({
      prompts: ["hello", undefined],
    });
    const agent = createAgent(streamCalls);

    await new AgentTUIRunner({ agent, name: "Test Agent", renderer }).run();

    expect(streamCalls).toEqual([
      {
        messages: [createUserMessage("message-1", "hello")],
      },
    ]);
    expect(terminalRendererOptions).toEqual([]);
    expect(renderer.submittedPrompts).toEqual(["hello"]);
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

function createApprovalAgent(streamCalls: AgentTUIStreamOptions[]): AgentTUIAgent {
  return {
    stream(options: AgentTUIStreamOptions) {
      streamCalls.push(options);

      return {
        fullStream:
          streamCalls.length === 1 ? createApprovalRequestStream() : createApprovalResponseStream(),
      };
    },
  };
}

function createAISDKAgent(): Agent<any, any, any, any> {
  return { version: "agent-v1" } as Agent<any, any, any, any>;
}

type TestRenderer = AgentTUIRenderer & {
  submittedPrompts: string[];
  titles: string[];
  toolApprovalRequests: AgentTUIToolApprovalRequest[];
};

function useRenderer<TRenderer extends AgentTUIRenderer>(renderer: TRenderer): TRenderer {
  testRenderer = renderer;

  return renderer;
}

function createRenderer(options: {
  prompts: Array<string | undefined>;
  toolApprovals?: AgentTUIToolApprovalResponse[];
}): TestRenderer {
  const submittedPrompts: string[] = [];
  const titles: string[] = [];
  const toolApprovalRequests: AgentTUIToolApprovalRequest[] = [];

  return {
    submittedPrompts,
    titles,
    toolApprovalRequests,
    async readPrompt(sessionOptions) {
      if (sessionOptions?.title) {
        titles.push(sessionOptions.title);
      }

      return options.prompts.shift();
    },
    async readToolApproval(request, sessionOptions) {
      if (sessionOptions?.title) {
        titles.push(sessionOptions.title);
      }

      toolApprovalRequests.push(request);

      const approval = options.toolApprovals?.shift();
      if (!approval) {
        throw new Error("Expected a test tool approval.");
      }

      return approval;
    },
    async renderStream(result, sessionOptions) {
      if (sessionOptions?.title) {
        titles.push(sessionOptions.title);
      }

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

function createAssistantMessageWithToolApproval(id: string, approved: boolean): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [
      {
        type: "tool-shell",
        toolCallId: "call-1",
        state: "approval-responded",
        input: { command: "date" },
        approval: { id: "approval-1", approved },
      },
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

function createApprovalRequestStream(): AsyncIterable<TextStreamPart<ToolSet>> {
  return (async function* () {
    yield {
      type: "tool-approval-request",
      approvalId: "approval-1",
      toolCall: {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "shell",
        input: { command: "date" },
      },
    } as TextStreamPart<ToolSet>;
  })();
}

function createApprovalResponseStream(): AsyncIterable<TextStreamPart<ToolSet>> {
  return (async function* () {
    yield {
      type: "tool-approval-response",
      approvalId: "approval-1",
      toolCall: {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "shell",
        input: { command: "date" },
      },
      approved: true,
    } as TextStreamPart<ToolSet>;
    yield {
      type: "tool-result",
      toolCallId: "call-1",
      toolName: "shell",
      input: { command: "date" },
      output: "ok",
    } as TextStreamPart<ToolSet>;
    yield { type: "text-delta", id: "text-1", text: "command approved" };
  })();
}
