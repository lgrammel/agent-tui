import { TerminalRenderer } from "./tui/terminal-renderer";
import {
  createAgentUIStream,
  type Agent,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

export type AgentTUIMessage = UIMessage;
export type AgentTUIStreamPart = UIMessageChunk;
export type AgentTUIMessageStream =
  | AsyncIterable<AgentTUIStreamPart>
  | ReadableStream<AgentTUIStreamPart>;

export type AgentTUIStreamResult = {
  uiMessageStream: AgentTUIMessageStream;
};

export type AgentTUIStreamOptions = {
  messages: AgentTUIMessage[];
};

type AgentTUITextStreamResult = {
  fullStream: AsyncIterable<TextStreamPart<ToolSet>>;
  toUIMessageStream?: (options?: {
    originalMessages?: AgentTUIMessage[];
    generateMessageId?: () => string;
  }) => AgentTUIMessageStream;
};

type AgentTUIAdapterStreamResult = AgentTUIStreamResult | AgentTUITextStreamResult;

export type AgentTUIAgent =
  | Agent
  | {
      stream(
        options: AgentTUIStreamOptions,
      ): Promise<AgentTUIAdapterStreamResult> | AgentTUIAdapterStreamResult;
    };

export type AgentTUIRenderer = {
  readPrompt?(options?: AgentTUISessionOptions): Promise<string | undefined>;
  renderStream(
    result: AgentTUIStreamResult,
    options?: AgentTUISessionOptions,
  ): Promise<AgentTUIMessage | undefined>;
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
  submittedPrompt?: string;
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
    let nextMessageIndex = 0;
    const generateMessageId = () => `message-${++nextMessageIndex}`;
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

      messages.push(createUserMessage(generateMessageId(), prompt));
      hasRunTurn = true;

      const result = await this.#streamMessages([...messages], generateMessageId);

      try {
        const responseMessage = await this.#renderer.renderStream(result, {
          title,
          submittedPrompt: prompt,
          continueSession: Boolean(this.#renderer.readPrompt),
          waitForExit: false,
        });

        if (responseMessage && responseMessage.parts.length > 0) {
          messages.push(responseMessage);
        }
      } catch (error) {
        if (isInterruptedError(error)) {
          return;
        }

        throw error;
      }
      prompt = undefined;
    }
  }

  async #streamMessages(
    messages: AgentTUIMessage[],
    generateMessageId: () => string,
  ): Promise<AgentTUIStreamResult> {
    if (isAISDKAgent(this.#agent)) {
      return {
        uiMessageStream: await createAgentUIStream({
          agent: this.#agent,
          uiMessages: messages,
          generateMessageId,
        }),
      };
    }

    const result = await this.#agent.stream({ messages });

    return normalizeStreamResult(result, messages, generateMessageId);
  }
}

const defaultRenderer: AgentTUIRenderer = new TerminalRenderer();

function normalizeStreamResult(
  result: AgentTUIAdapterStreamResult,
  originalMessages: AgentTUIMessage[],
  generateMessageId: () => string,
): AgentTUIStreamResult {
  if ("uiMessageStream" in result) {
    return result;
  }

  if (result.toUIMessageStream) {
    return {
      uiMessageStream: result.toUIMessageStream({
        originalMessages,
        generateMessageId,
      }),
    };
  }

  return {
    uiMessageStream: textStreamToUIMessageStream(result.fullStream, generateMessageId),
  };
}

async function* textStreamToUIMessageStream(
  stream: AsyncIterable<TextStreamPart<ToolSet>>,
  generateMessageId: () => string,
): AsyncIterable<AgentTUIStreamPart> {
  const openTextParts = new Set<string>();
  const openReasoningParts = new Set<string>();
  let sentFinish = false;

  yield { type: "start", messageId: generateMessageId() };

  for await (const part of stream) {
    switch (part.type) {
      case "text-start":
        openTextParts.add(part.id);
        yield {
          type: "text-start",
          id: part.id,
          providerMetadata: part.providerMetadata,
        };
        break;
      case "text-delta":
        if (!openTextParts.has(part.id)) {
          openTextParts.add(part.id);
          yield {
            type: "text-start",
            id: part.id,
            providerMetadata: part.providerMetadata,
          };
        }
        yield {
          type: "text-delta",
          id: part.id,
          delta: part.text,
          providerMetadata: part.providerMetadata,
        };
        break;
      case "text-end":
        openTextParts.delete(part.id);
        yield {
          type: "text-end",
          id: part.id,
          providerMetadata: part.providerMetadata,
        };
        break;
      case "reasoning-start":
        openReasoningParts.add(part.id);
        yield {
          type: "reasoning-start",
          id: part.id,
          providerMetadata: part.providerMetadata,
        };
        break;
      case "reasoning-delta":
        if (!openReasoningParts.has(part.id)) {
          openReasoningParts.add(part.id);
          yield {
            type: "reasoning-start",
            id: part.id,
            providerMetadata: part.providerMetadata,
          };
        }
        yield {
          type: "reasoning-delta",
          id: part.id,
          delta: part.text,
          providerMetadata: part.providerMetadata,
        };
        break;
      case "reasoning-end":
        openReasoningParts.delete(part.id);
        yield {
          type: "reasoning-end",
          id: part.id,
          providerMetadata: part.providerMetadata,
        };
        break;
      case "tool-input-start":
        yield {
          type: "tool-input-start",
          toolCallId: part.id,
          toolName: part.toolName,
          providerExecuted: part.providerExecuted,
          providerMetadata: part.providerMetadata,
          toolMetadata: part.toolMetadata,
          dynamic: part.dynamic,
          title: part.title,
        };
        break;
      case "tool-input-delta":
        yield {
          type: "tool-input-delta",
          toolCallId: part.id,
          inputTextDelta: part.delta,
        };
        break;
      case "tool-call":
        yield {
          type: "tool-input-available",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
          providerExecuted: part.providerExecuted,
          providerMetadata: part.providerMetadata,
          toolMetadata: part.toolMetadata,
          dynamic: part.dynamic,
          title: part.title,
        };
        break;
      case "tool-result":
        yield {
          type: "tool-output-available",
          toolCallId: part.toolCallId,
          output: part.output,
          providerExecuted: part.providerExecuted,
          providerMetadata: part.providerMetadata,
          toolMetadata: part.toolMetadata,
          dynamic: part.dynamic,
          preliminary: part.preliminary,
        };
        break;
      case "tool-error":
        yield {
          type: "tool-output-error",
          toolCallId: part.toolCallId,
          errorText: formatStreamError(part.error),
          providerExecuted: part.providerExecuted,
          providerMetadata: part.providerMetadata,
          toolMetadata: part.toolMetadata,
          dynamic: part.dynamic,
        };
        break;
      case "tool-output-denied":
        yield { type: "tool-output-denied", toolCallId: part.toolCallId };
        break;
      case "source":
        if (part.sourceType === "url") {
          yield {
            type: "source-url",
            sourceId: part.id,
            url: part.url,
            title: part.title,
            providerMetadata: part.providerMetadata,
          };
        } else {
          yield {
            type: "source-document",
            sourceId: part.id,
            mediaType: part.mediaType,
            title: part.title,
            filename: part.filename,
            providerMetadata: part.providerMetadata,
          };
        }
        break;
      case "file":
        yield {
          type: "file",
          url: fileToDataUrl(part.file.mediaType, part.file.base64),
          mediaType: part.file.mediaType,
          providerMetadata: part.providerMetadata,
        };
        break;
      case "reasoning-file":
        yield {
          type: "reasoning-file",
          url: fileToDataUrl(part.file.mediaType, part.file.base64),
          mediaType: part.file.mediaType,
          providerMetadata: part.providerMetadata,
        };
        break;
      case "start-step":
        yield { type: "start-step" };
        break;
      case "finish-step":
        yield { type: "finish-step" };
        break;
      case "finish":
        yield* closeOpenParts(openTextParts, openReasoningParts);
        sentFinish = true;
        yield { type: "finish", finishReason: part.finishReason };
        break;
      case "abort":
        yield { type: "abort", reason: part.reason };
        break;
      case "error":
        yield { type: "error", errorText: formatStreamError(part.error) };
        break;
    }
  }

  if (!sentFinish) {
    yield* closeOpenParts(openTextParts, openReasoningParts);
    yield { type: "finish" };
  }
}

function* closeOpenParts(textPartIds: Set<string>, reasoningPartIds: Set<string>) {
  for (const id of textPartIds) {
    yield { type: "text-end", id } satisfies AgentTUIStreamPart;
  }
  textPartIds.clear();

  for (const id of reasoningPartIds) {
    yield { type: "reasoning-end", id } satisfies AgentTUIStreamPart;
  }
  reasoningPartIds.clear();
}

function createUserMessage(id: string, text: string): AgentTUIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function formatStreamError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return JSON.stringify(error);
}

function fileToDataUrl(mediaType: string, base64: string) {
  return `data:${mediaType};base64,${base64}`;
}

function isAISDKAgent(agent: AgentTUIAgent): agent is Agent {
  return "version" in agent && agent.version === "agent-v1";
}

function isInterruptedError(error: unknown) {
  return error instanceof Error && error.message === "Interrupted";
}
