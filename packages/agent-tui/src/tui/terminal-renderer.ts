import type { AgentTUIStreamResult } from "../agent-tui";
import { clampScrollOffset, renderScreen } from "./layout";

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

export class TerminalRenderer {
  readonly #input: TerminalInput;
  readonly #output: TerminalOutput;
  readonly #includeReasoning: boolean;

  #body = "";
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
            this.#body += `\nYou: ${prompt}\n\n`;
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
              this.#append("\nReasoning:\n");
            }
            break;
          case "reasoning-delta":
            if (this.#includeReasoning) {
              this.#append(part.text);
            }
            break;
          case "reasoning-end":
            if (this.#includeReasoning) {
              this.#append("\n\n");
            }
            break;
          case "text-delta":
            this.#append(part.text);
            break;
          case "tool-call":
            this.#append(`\n\nTool call: ${JSON.stringify(part)}\n\n`);
            break;
          case "tool-result":
            this.#append(`\n\nTool result: ${JSON.stringify(part)}\n\n`);
            break;
          case "tool-error":
            this.#append(`\n\nTool error: ${formatStreamError(part.error)}\n\n`);
            break;
          case "error":
            this.#append(`\n\nError: ${formatStreamError(part.error)}\n\n`);
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
      this.#body,
      bodyHeight,
      this.#width(),
    );
    this.#paint();
  }

  #append(text: string) {
    this.#body += text;

    if (this.#scrollOffset === 0) {
      this.#paint();
      return;
    }

    this.#scrollOffset = clampScrollOffset(
      this.#scrollOffset,
      this.#body,
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
      body: this.#body || "Waiting for input...",
      input: this.#inputText,
      inputActive: this.#inputActive,
      scrollOffset: this.#scrollOffset,
      status: this.#status,
    });

    this.#output.write(`\x1b[H\x1b[2J${frame}`);
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
