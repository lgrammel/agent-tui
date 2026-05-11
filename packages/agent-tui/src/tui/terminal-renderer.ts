import type { AgentTUIStreamResult } from "../agent-tui";
import { clampScrollOffset, renderScreen, sliceVisible, visibleLength } from "./layout";
import { renderMarkdown } from "./markdown";

export type TerminalInput = NodeJS.ReadStream & {
  setRawMode?: (mode: boolean) => TerminalInput;
};

export type TerminalOutput = NodeJS.WriteStream & {
  columns?: number;
  rows?: number;
};

export type TerminalRendererOptions = {
  input?: TerminalInput;
  output?: TerminalOutput;
  includeReasoning?: boolean;
};

export type TerminalSessionOptions = {
  title?: string;
  initialPrompt?: string;
  submittedPrompt?: string;
  waitForExit?: boolean;
  continueSession?: boolean;
};

export type TerminalKey =
  | { type: "character"; value: string }
  | { type: "backspace" }
  | { type: "enter" }
  | { type: "up" }
  | { type: "down" }
  | { type: "ctrl-c" }
  | { type: "ignore" };

type ChatSectionKind = "user" | "assistant" | "reasoning" | "tool" | "error";

type ChatSection = {
  kind: ChatSectionKind;
  title: string;
  content: string;
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

export class TerminalRenderer {
  readonly #input: TerminalInput;
  readonly #output: TerminalOutput;
  readonly #includeReasoning: boolean;

  #sections: ChatSection[] = [];
  #inputText = "";
  #inputActive = false;
  #scrollOffset = 0;
  #title = "Agent TUI";
  #status = "Streaming... ↑/↓ scroll · Ctrl+C quit";
  #isInteractive = false;
  #interrupted = false;
  #onData?: (chunk: Buffer) => void;
  #onResize?: () => void;

  constructor(options?: TerminalRendererOptions) {
    this.#input = options?.input ?? process.stdin;
    this.#output = options?.output ?? process.stdout;
    this.#includeReasoning = options?.includeReasoning ?? false;
  }

  async readPrompt(options?: TerminalSessionOptions): Promise<string> {
    this.#start(options);
    this.#inputActive = true;
    this.#inputText = options?.initialPrompt ?? "";
    this.#status = "Type a prompt and press Enter · ↑/↓ scroll · Ctrl+C quit";
    this.#paint();

    return await new Promise((resolve, reject) => {
      this.#onData = (chunk) => {
        const key = parseKey(chunk);

        switch (key.type) {
          case "character":
            this.#inputText += key.value;
            this.#paint();
            break;
          case "backspace":
            this.#inputText = this.#inputText.slice(0, -1);
            this.#paint();
            break;
          case "enter": {
            const prompt = this.#inputText;
            this.#inputActive = false;
            this.#sections.push({ kind: "user", title: "User", content: prompt });
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
          case "ctrl-c":
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
  ): Promise<void> {
    this.#start(options);
    this.#addSubmittedPrompt(options?.submittedPrompt);
    this.#inputActive = false;
    this.#status = "Streaming... ↑/↓ scroll · Ctrl+C quit";
    this.#interrupted = false;
    this.#paint();
    this.#onData = (chunk) => this.#handleStreamingKey(chunk);
    this.#attachInput();

    try {
      for await (const part of result.fullStream) {
        if (this.#interrupted) {
          break;
        }

        switch (part.type) {
          case "reasoning-start":
            if (this.#includeReasoning) {
              this.#startSection("reasoning", "Reasoning");
            }
            break;
          case "reasoning-delta":
            if (this.#includeReasoning) {
              this.#appendToSection("reasoning", "Reasoning", part.text);
            }
            break;
          case "reasoning-end":
            if (this.#includeReasoning) {
              this.#paintAfterBodyChange();
            }
            break;
          case "text-delta":
            this.#appendToSection("assistant", "Assistant", part.text);
            break;
          case "tool-call":
            this.#addSection(
              "tool",
              `Tool Call · ${part.toolName ?? "unknown"}`,
              formatToolPart(part),
            );
            break;
          case "tool-result":
            this.#addSection(
              "tool",
              `Tool Result · ${part.toolName ?? "unknown"}`,
              formatToolPart(part),
            );
            break;
          case "tool-error":
            this.#addSection("error", "Tool Error", formatStreamError(part.error));
            break;
          case "error":
            this.#addSection("error", "Error", formatStreamError(part.error));
            break;
        }
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
  }

  #start(options?: TerminalSessionOptions) {
    this.#title = options?.title ?? this.#title;

    if (this.#isInteractive) {
      return;
    }

    this.#isInteractive = true;
    this.#output.write("\x1b[?1049h\x1b[?25l");

    if (this.#input.isTTY) {
      this.#input.setRawMode?.(true);
      this.#input.resume();
    }

    this.#onResize = () => this.#paint();
    this.#output.on("resize", this.#onResize);
  }

  #stop() {
    this.#detachInput();

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

  #startSection(kind: ChatSectionKind, title: string) {
    this.#sections.push({ kind, title, content: "" });
    this.#paintAfterBodyChange();
  }

  #addSubmittedPrompt(prompt: string | undefined) {
    if (prompt == null) {
      return;
    }

    const section = this.#sections.at(-1);

    if (section?.kind === "user" && section.content === prompt) {
      return;
    }

    this.#sections.push({ kind: "user", title: "User", content: prompt });
  }

  #addSection(kind: ChatSectionKind, title: string, content: string) {
    this.#sections.push({ kind, title, content });
    this.#paintAfterBodyChange();
  }

  #appendToSection(kind: ChatSectionKind, title: string, text: string) {
    const section = this.#sections.at(-1);

    if (section?.kind === kind && section.title === title) {
      section.content += text;
    } else {
      this.#sections.push({ kind, title, content: text });
    }

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
      scrollOffset: this.#scrollOffset,
      status: this.#status,
    });

    this.#output.write(`\x1b[H\x1b[2J${frame}`);
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

function formatToolPart(part: unknown) {
  return JSON.stringify(part, null, 2);
}

function renderSection(section: ChatSection, width: number) {
  const style = sectionStyles[section.kind];
  const contentWidth = Math.max(1, width - 4);
  const title = ` ${section.title} `;
  const top = `${style.color}╭${title}${style.border.repeat(Math.max(0, width - 2 - title.length))}╮${colors.reset}`;
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

export function parseKey(chunk: Buffer): TerminalKey {
  const value = chunk.toString("utf8");

  switch (value) {
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
