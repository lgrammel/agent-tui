import type {
  AgentTUIStreamResult,
  AgentTUIToolApprovalRequest,
  AgentTUIToolApprovalResponse,
} from "../agent-tui-runner";
import { clampScrollOffset, renderScreen, sliceVisible, visibleLength } from "./layout";
import { renderMarkdown } from "./markdown";
import { TerminalFrameBuffer } from "./terminal-frame-buffer";
import {
  getToolName,
  isToolUIPart,
  readUIMessageStream,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

export type TerminalInput = {
  isTTY?: boolean;
  on(event: "data", listener: (chunk: Buffer) => void): TerminalInput;
  off(event: "data", listener: (chunk: Buffer) => void): TerminalInput;
  resume(): TerminalInput;
  pause(): TerminalInput;
  setRawMode?: (mode: boolean) => TerminalInput;
};

export type TerminalOutput = {
  columns?: number;
  rows?: number;
  write(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ): boolean;
  on(event: "resize", listener: () => void): TerminalOutput;
  off(event: "resize", listener: () => void): TerminalOutput;
};

export type TerminalPartDisplayMode = "full" | "collapsed" | "hidden";

export type TerminalRendererOptions = {
  input?: TerminalInput;
  output?: TerminalOutput;
  frameBuffer?: TerminalFrameBuffer;
  tools?: TerminalPartDisplayMode;
  reasoning?: TerminalPartDisplayMode;
};

export type TerminalSessionOptions = {
  title?: string;
  initialPrompt?: string;
  submittedPrompt?: string;
  waitForExit?: boolean;
  continueSession?: boolean;
  tools?: TerminalPartDisplayMode;
  reasoning?: TerminalPartDisplayMode;
};

export type TerminalKey =
  | { type: "character"; value: string }
  | { type: "backspace" }
  | { type: "enter" }
  | { type: "up" }
  | { type: "down" }
  | { type: "ctrl-r" }
  | { type: "ctrl-c" }
  | { type: "ignore" };

type ChatSectionKind = "user" | "assistant" | "reasoning" | "tool" | "error";

type ChatSection = {
  kind: ChatSectionKind;
  title: string;
  rightTitle?: string;
  content: string;
  collapsed?: boolean;
  id?: string;
};

type StreamUsage = {
  outputTokens?: number | { total?: number };
  completionTokens?: number;
};

type MessageMetadataWithUsage = {
  usage?: StreamUsage;
};

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  user: "\x1b[96m",
  assistant: "\x1b[92m",
  reasoning: "\x1b[94m",
  tool: "\x1b[95m",
  error: "\x1b[91m",
};

const sectionStyles: Record<ChatSectionKind, { color: string; border: string }> = {
  user: { color: colors.user, border: "─" },
  assistant: { color: colors.assistant, border: "─" },
  reasoning: { color: colors.reasoning, border: "·" },
  tool: { color: colors.tool, border: "─" },
  error: { color: colors.error, border: "─" },
};

const inputCursorBlinkMs = 500;

export class TerminalRenderer {
  readonly #input: TerminalInput;
  readonly #output: TerminalOutput;
  readonly #frameBuffer: TerminalFrameBuffer;
  readonly #tools: TerminalPartDisplayMode;
  readonly #reasoning: TerminalPartDisplayMode;

  #sections: ChatSection[] = [];
  #inputText = "";
  #inputActive = false;
  #scrollOffset = 0;
  #title = "Agent TUI";
  #status = "Streaming... ↑/↓ scroll · Ctrl+C quit";
  #isInteractive = false;
  #interrupted = false;
  #assistantOutputTokens?: number;
  #inputCursorVisible = true;
  #inputCursorTimer?: ReturnType<typeof setInterval>;
  #onData?: (chunk: Buffer) => void;
  #onResize?: () => void;

  constructor(options?: TerminalRendererOptions) {
    this.#input = options?.input ?? process.stdin;
    this.#output = options?.output ?? process.stdout;
    this.#frameBuffer = options?.frameBuffer ?? new TerminalFrameBuffer(this.#output);
    this.#tools = options?.tools ?? "full";
    this.#reasoning = options?.reasoning ?? "full";
  }

  async readPrompt(options?: TerminalSessionOptions): Promise<string> {
    this.#start(options);
    this.#inputActive = true;
    this.#inputText = options?.initialPrompt ?? "";
    this.#status = "Type a prompt and press Enter · ↑/↓ scroll · Ctrl+C quit";
    this.#startInputCursorBlink();
    this.#paint();

    return await new Promise((resolve, reject) => {
      this.#onData = (chunk) => {
        const key = parseKey(chunk);

        switch (key.type) {
          case "character":
            this.#inputText += key.value;
            this.#showInputCursor();
            this.#paint();
            break;
          case "backspace":
            this.#inputText = this.#inputText.slice(0, -1);
            this.#showInputCursor();
            this.#paint();
            break;
          case "enter": {
            const prompt = this.#inputText;
            this.#inputActive = false;
            this.#stopInputCursorBlink();
            this.#addUserSection(prompt);
            this.#status = "Streaming... ↑/↓ scroll · Ctrl+C quit";
            this.#inputText = "";
            this.#paint();
            this.#detachInput();
            resolve(prompt);
            break;
          }
          case "up":
          case "down":
            this.#handleScroll(key.type);
            break;
          case "ctrl-r":
            this.#repaint();
            break;
          case "ctrl-c":
            this.#stopInputCursorBlink();
            this.#stop();
            reject(interruptedError());
            break;
          case "ignore":
            break;
        }
      };

      this.#attachInput();
    });
  }

  async renderStream(
    result: AgentTUIStreamResult,
    options?: TerminalSessionOptions,
  ): Promise<UIMessage | undefined> {
    this.#start(options);
    this.#addSubmittedPrompt(options?.submittedPrompt);
    this.#inputActive = false;
    this.#status = "Streaming... ↑/↓ scroll · Ctrl+C quit";
    this.#interrupted = false;
    this.#assistantOutputTokens = undefined;
    const displayModes = {
      tools: options?.tools ?? this.#tools,
      reasoning: options?.reasoning ?? this.#reasoning,
    };
    this.#paint();
    this.#onData = (chunk) => this.#handleStreamingKey(chunk);
    this.#attachInput();
    let responseMessage: UIMessage | undefined;

    try {
      for await (const message of readUIMessageStream({
        message: result.message,
        stream: toReadableStream(this.#observeUIMessageStream(result.uiMessageStream)),
        onError: (error) => this.#addErrorSection("Error", formatStreamError(error)),
      })) {
        if (this.#interrupted) {
          break;
        }

        responseMessage = message;
        this.#renderAssistantMessage(message, displayModes);
      }

      if (!this.#interrupted && responseMessage && this.#assistantOutputTokens != null) {
        this.#renderAssistantMessage(responseMessage, displayModes);
      }
    } finally {
      this.#detachInput();
      this.#status = this.#interrupted
        ? "Interrupted"
        : options?.continueSession
          ? "Done · Enter another prompt · ↑/↓ scroll · Ctrl+C quit"
          : "Done · ↑/↓ scroll · q/Ctrl+C quit";
      this.#paint();
      await this.#waitForExit(options);

      if (this.#interrupted || !options?.continueSession) {
        this.#stop();
      }
    }

    if (this.#interrupted) {
      throw interruptedError();
    }

    return responseMessage;
  }

  async readToolApproval(
    request: AgentTUIToolApprovalRequest,
    options?: TerminalSessionOptions,
  ): Promise<AgentTUIToolApprovalResponse> {
    this.#start(options);
    this.#inputActive = false;
    this.#status = `Approve ${formatToolApprovalTitle(request)}? y/n · ↑/↓ scroll · Ctrl+C quit`;
    this.#interrupted = false;
    this.#paint();

    return await new Promise((resolve, reject) => {
      this.#onData = (chunk) => {
        const key = parseKey(chunk);

        switch (key.type) {
          case "character": {
            const value = key.value.toLowerCase();

            if (value === "y") {
              this.#status = "Approved · Streaming... ↑/↓ scroll · Ctrl+C quit";
              this.#detachInput();
              this.#paint();
              resolve({ approved: true });
            } else if (value === "n") {
              this.#status = "Denied · Streaming... ↑/↓ scroll · Ctrl+C quit";
              this.#detachInput();
              this.#paint();
              resolve({ approved: false, reason: "Denied by user." });
            }
            break;
          }
          case "up":
          case "down":
            this.#handleScroll(key.type);
            break;
          case "ctrl-r":
            this.#repaint();
            break;
          case "ctrl-c":
            this.#interrupted = true;
            this.#stop();
            reject(interruptedError());
            break;
          default:
            break;
        }
      };

      this.#attachInput();
    });
  }

  #start(options?: TerminalSessionOptions) {
    this.#title = options?.title ?? this.#title;

    if (this.#isInteractive) {
      return;
    }

    this.#isInteractive = true;
    this.#frameBuffer.reset();
    this.#output.write("\x1b[?1049h\x1b[?25l");

    if (this.#input.isTTY) {
      this.#input.setRawMode?.(true);
      this.#input.resume();
    }

    this.#onResize = () => this.#repaint();
    this.#output.on("resize", this.#onResize);
  }

  #stop() {
    this.#detachInput();
    this.#stopInputCursorBlink();

    if (!this.#isInteractive) {
      return;
    }

    if (this.#input.isTTY) {
      this.#input.setRawMode?.(false);
      this.#input.pause();
    }

    if (this.#onResize) {
      this.#output.off("resize", this.#onResize);
      this.#onResize = undefined;
    }

    this.#output.write("\x1b[?25h\x1b[?1049l");
    this.#frameBuffer.reset();
    this.#isInteractive = false;
  }

  #attachInput() {
    if (this.#onData) {
      this.#input.on("data", this.#onData);
    }
  }

  #detachInput() {
    if (this.#onData) {
      this.#input.off("data", this.#onData);
      this.#onData = undefined;
    }
  }

  #handleStreamingKey(chunk: Buffer) {
    const key = parseKey(chunk);

    switch (key.type) {
      case "up":
      case "down":
        this.#handleScroll(key.type);
        break;
      case "ctrl-r":
        this.#repaint();
        break;
      case "ctrl-c":
        this.#interrupted = true;
        break;
      default:
        break;
    }
  }

  #handleScroll(direction: "up" | "down") {
    const delta = direction === "up" ? 1 : -1;
    const bodyHeight = this.#height() - 3;
    this.#scrollOffset = clampScrollOffset(
      this.#scrollOffset + delta,
      this.#body(),
      bodyHeight,
      this.#width(),
    );
    this.#paint();
  }

  #startInputCursorBlink() {
    this.#stopInputCursorBlink();
    this.#showInputCursor();
    this.#inputCursorTimer = setInterval(() => {
      this.#inputCursorVisible = !this.#inputCursorVisible;
      this.#paint();
    }, inputCursorBlinkMs);
    this.#inputCursorTimer.unref?.();
  }

  #stopInputCursorBlink() {
    if (this.#inputCursorTimer) {
      clearInterval(this.#inputCursorTimer);
      this.#inputCursorTimer = undefined;
    }

    this.#inputCursorVisible = true;
  }

  #showInputCursor() {
    this.#inputCursorVisible = true;
  }

  #addSubmittedPrompt(prompt: string | undefined) {
    if (prompt == null) {
      return;
    }

    const section = this.#sections.at(-1);

    if (section?.kind === "user" && section.content === prompt) {
      return;
    }

    this.#addUserSection(prompt);
  }

  #addUserSection(prompt: string) {
    this.#sections.push({ kind: "user", title: "User", content: prompt });
    this.#paintAfterBodyChange();
  }

  #renderAssistantMessage(
    message: UIMessage,
    displayModes: {
      tools: TerminalPartDisplayMode;
      reasoning: TerminalPartDisplayMode;
    },
  ) {
    const activeSectionIds = new Set<string>();
    this.#assistantOutputTokens =
      extractOutputTokenCountFromMetadata(message.metadata) ?? this.#assistantOutputTokens;

    for (const [index, part] of message.parts.entries()) {
      const id = sectionId(message.id, index);

      switch (part.type) {
        case "text":
          activeSectionIds.add(id);
          this.#upsertSection({
            id,
            kind: "assistant",
            title: "Assistant",
            rightTitle: formatTokenCount(this.#assistantOutputTokens),
            content: part.text,
          });
          break;
        case "reasoning":
          if (displayModes.reasoning === "hidden") {
            break;
          }

          activeSectionIds.add(id);
          this.#upsertSection({
            id,
            kind: "reasoning",
            title: "Reasoning",
            content: part.text,
            collapsed: displayModes.reasoning === "collapsed",
          });
          break;
        default:
          if (isToolUIPart(part)) {
            if (displayModes.tools === "hidden") {
              break;
            }

            activeSectionIds.add(id);
            this.#upsertSection({
              id,
              ...renderToolInvocation(part, { mode: displayModes.tools }),
            });
          }
          break;
      }
    }

    this.#removeStaleAssistantSections(message.id, activeSectionIds);
    this.#paintAfterBodyChange();
  }

  #upsertSection(section: ChatSection) {
    const existingSection = section.id
      ? this.#sections.find((candidate) => candidate.id === section.id)
      : undefined;

    if (existingSection) {
      existingSection.kind = section.kind;
      existingSection.title = section.title;
      existingSection.rightTitle = section.rightTitle;
      existingSection.content = section.content;
      return;
    }

    this.#sections.push(section);
  }

  #removeStaleAssistantSections(messageId: string, activeSectionIds: Set<string>) {
    const prefix = `${messageId}:`;
    this.#sections = this.#sections.filter(
      (section) =>
        section.id == null || !section.id.startsWith(prefix) || activeSectionIds.has(section.id),
    );
  }

  async *#observeUIMessageStream(
    stream: AsyncIterable<UIMessageChunk> | ReadableStream<UIMessageChunk>,
  ): AsyncIterable<UIMessageChunk> {
    for await (const chunk of iterateUIMessageStream(stream)) {
      if (chunk.type === "error") {
        this.#addErrorSection("Error", chunk.errorText);
      }

      if (chunk.type === "finish") {
        this.#assistantOutputTokens = extractOutputTokenCount(chunk);
      }

      yield chunk;
    }
  }

  #addErrorSection(title: string, content: string) {
    this.#sections.push({ kind: "error", title, content });
    this.#paintAfterBodyChange();
  }

  #paintAfterBodyChange() {
    const body = this.#body();

    if (this.#scrollOffset === 0) {
      this.#paint();
      return;
    }

    this.#scrollOffset = clampScrollOffset(
      this.#scrollOffset,
      body,
      this.#height() - 3,
      this.#width(),
    );
    this.#paint();
  }

  #paint() {
    const frame = renderScreen({
      width: this.#width(),
      height: this.#height(),
      title: this.#title,
      body: this.#body() || "Waiting for input...",
      input: this.#inputText,
      inputActive: this.#inputActive,
      inputCursorVisible: this.#inputCursorVisible,
      scrollOffset: this.#scrollOffset,
      status: this.#status,
    });

    this.#frameBuffer.present(frame);
  }

  #repaint() {
    this.#frameBuffer.reset();
    this.#paint();
  }

  #body() {
    return this.#sections.map((section) => renderSection(section, this.#width() - 4)).join("\n");
  }

  #width() {
    return Math.max(20, this.#output.columns ?? 80);
  }

  #height() {
    return Math.max(8, this.#output.rows ?? 24);
  }

  async #waitForExit(options?: TerminalSessionOptions) {
    if (options?.waitForExit === false || !this.#input.isTTY || this.#interrupted) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.#onData = (chunk) => {
        const key = parseKey(chunk);

        switch (key.type) {
          case "up":
          case "down":
            this.#handleScroll(key.type);
            break;
          case "ctrl-r":
            this.#repaint();
            break;
          case "character":
            if (key.value === "q") {
              this.#detachInput();
              resolve();
            }
            break;
          case "ctrl-c":
            this.#detachInput();
            process.exitCode = 130;
            resolve();
            break;
          default:
            break;
        }
      };

      this.#attachInput();
    });
  }
}

function interruptedError() {
  return new Error("Interrupted");
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

function renderToolInvocation(
  part: ToolUIPart | DynamicToolUIPart,
  options: { mode: Exclude<TerminalPartDisplayMode, "hidden"> },
): ChatSection {
  const toolName = getToolName(part);
  const title = `Tool · ${part.title ?? toolName}`;
  const input = "input" in part ? part.input : undefined;
  const inputText = input === undefined ? "Input: (streaming...)" : `Input:\n${formatValue(input)}`;
  const status = toolStatus(part);

  if (options.mode === "collapsed") {
    return {
      kind: "tool",
      title,
      rightTitle: status,
      content: "",
      collapsed: true,
    };
  }

  switch (part.state) {
    case "input-streaming":
      return {
        kind: "tool",
        title,
        rightTitle: status,
        content: inputText,
      };
    case "input-available":
      return {
        kind: "tool",
        title,
        rightTitle: status,
        content: inputText,
      };
    case "approval-requested":
      return {
        kind: "tool",
        title,
        rightTitle: status,
        content: inputText,
      };
    case "approval-responded":
      return {
        kind: "tool",
        title,
        rightTitle: status,
        content: inputText,
      };
    case "output-available":
      return {
        kind: "tool",
        title,
        rightTitle: status,
        content: `${inputText}\n\nOutput:\n${formatValue(part.output)}`,
      };
    case "output-error":
      return {
        kind: "error",
        title: `Tool Error · ${part.title ?? toolName}`,
        rightTitle: status,
        content: `${inputText}\n\nError:\n${part.errorText}`,
      };
    case "output-denied":
      return {
        kind: "error",
        title: `Tool Denied · ${part.title ?? toolName}`,
        rightTitle: status,
        content: `${inputText}\n\nReason: ${part.approval.reason ?? "denied"}`,
      };
  }
}

function toolStatus(part: ToolUIPart | DynamicToolUIPart) {
  switch (part.state) {
    case "input-streaming":
      return "waiting";
    case "approval-requested":
      return "approval requested";
    case "input-available":
      return "executing";
    case "approval-responded":
      return part.approval.approved ? "executing" : "denied";
    case "output-available":
    case "output-error":
      return "done";
    case "output-denied":
      return "denied";
  }
}

function formatValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function formatToolApprovalTitle(request: AgentTUIToolApprovalRequest) {
  return `tool ${request.title ?? request.toolName}`;
}

function sectionId(messageId: string, partIndex: number) {
  return `${messageId}:${partIndex}`;
}

function toReadableStream(
  stream: AsyncIterable<UIMessageChunk> | ReadableStream<UIMessageChunk>,
): ReadableStream<UIMessageChunk> {
  if (stream instanceof ReadableStream) {
    return stream;
  }

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

async function* iterateUIMessageStream(
  stream: AsyncIterable<UIMessageChunk> | ReadableStream<UIMessageChunk>,
): AsyncIterable<UIMessageChunk> {
  if (stream instanceof ReadableStream) {
    const reader = stream.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          return;
        }

        yield value;
      }
    } finally {
      reader.releaseLock();
    }

    return;
  }

  yield* stream;
}

function renderSection(section: ChatSection, width: number) {
  const style = sectionStyles[section.kind];
  const contentWidth = Math.max(1, width - 4);
  const title = ` ${section.title} `;
  const rightTitle = section.rightTitle ? ` ${section.rightTitle} ` : "";

  if (section.collapsed) {
    const borderWidth = Math.max(0, width - 2 - title.length - rightTitle.length);
    const top = `${style.color}╭${title}${style.border.repeat(borderWidth)}${rightTitle}╮${colors.reset}`;
    const bottom = `${style.color}╰${style.border.repeat(Math.max(0, width - 2))}╯${colors.reset}`;

    return [top, bottom].join("\n");
  }

  const borderWidth = Math.max(0, width - 2 - title.length - rightTitle.length);
  const top = `${style.color}╭${title}${style.border.repeat(borderWidth)}${rightTitle}╮${colors.reset}`;
  const bottom = `${style.color}╰${style.border.repeat(Math.max(0, width - 2))}╯${colors.reset}`;
  const content =
    section.content.length > 0
      ? renderMarkdown(section.content)
      : colors.dim + "(streaming...)" + colors.reset;
  const lines = content.split("\n").flatMap((line) => wrapVisibleLine(line, contentWidth));

  return [top, ...lines.map((line) => sectionLine(line, contentWidth, style.color)), bottom].join(
    "\n",
  );
}

function sectionLine(line: string, contentWidth: number, color: string) {
  const visible = sliceVisible(line, contentWidth);
  const padding = " ".repeat(Math.max(0, contentWidth - visibleLength(visible)));

  return `${color}│${colors.reset} ${visible}${padding} ${color}│${colors.reset}`;
}

function wrapVisibleLine(line: string, width: number): string[] {
  if (line.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let remaining = line;

  while (visibleLength(remaining) > width) {
    const breakAt = findVisibleBreakPoint(remaining, width);
    lines.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }

  lines.push(remaining);
  return lines;
}

function findVisibleBreakPoint(input: string, width: number) {
  const slice = sliceVisible(input, width + 1);
  const lastSpace = slice.lastIndexOf(" ");

  if (lastSpace > 0) {
    return lastSpace;
  }

  return sliceVisible(input, width).length;
}

function extractOutputTokenCount(chunk: UIMessageChunk) {
  const usage = "usage" in chunk ? (chunk.usage as StreamUsage | undefined) : undefined;
  const metadataUsage =
    "messageMetadata" in chunk
      ? (chunk.messageMetadata as MessageMetadataWithUsage | undefined)?.usage
      : undefined;

  return extractOutputTokenCountFromUsage(usage ?? metadataUsage);
}

function extractOutputTokenCountFromMetadata(metadata: unknown) {
  return extractOutputTokenCountFromUsage(
    (metadata as MessageMetadataWithUsage | undefined)?.usage,
  );
}

function extractOutputTokenCountFromUsage(usage: StreamUsage | undefined) {
  const outputTokens = usage?.outputTokens;

  if (typeof outputTokens === "number") {
    return outputTokens;
  }

  if (typeof outputTokens?.total === "number") {
    return outputTokens.total;
  }

  return usage?.completionTokens;
}

function formatTokenCount(tokens: number | undefined) {
  if (tokens == null) {
    return undefined;
  }

  return `${tokens.toLocaleString()} ${tokens === 1 ? "token" : "tokens"}`;
}

export function parseKey(chunk: Buffer): TerminalKey {
  const value = chunk.toString("utf8");

  switch (value) {
    case "\u0012":
      return { type: "ctrl-r" };
    case "\u0003":
      return { type: "ctrl-c" };
    case "\r":
    case "\n":
      return { type: "enter" };
    case "\u007f":
    case "\b":
      return { type: "backspace" };
    case "\x1B[A":
      return { type: "up" };
    case "\x1B[B":
      return { type: "down" };
    default:
      if (value >= " " && value !== "\x7F") {
        return { type: "character", value };
      }

      return { type: "ignore" };
  }
}
