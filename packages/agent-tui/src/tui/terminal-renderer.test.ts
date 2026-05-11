import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  parseKey,
  TerminalRenderer,
  type TerminalInput,
  type TerminalOutput,
} from "./terminal-renderer";
import { stripAnsi } from "./layout";
import type { AgentTUIStreamResult } from "../agent-tui";
import type { UIMessageChunk } from "ai";

describe("parseKey", () => {
  it("decodes terminal control keys", () => {
    expect(parseKey(Buffer.from("\x1B[A"))).toEqual({ type: "up" });
    expect(parseKey(Buffer.from("\x1B[B"))).toEqual({ type: "down" });
    expect(parseKey(Buffer.from("\u007f"))).toEqual({ type: "backspace" });
    expect(parseKey(Buffer.from("\r"))).toEqual({ type: "enter" });
    expect(parseKey(Buffer.from("\u0012"))).toEqual({ type: "ctrl-r" });
    expect(parseKey(Buffer.from("\u0003"))).toEqual({ type: "ctrl-c" });
  });

  it("keeps printable input as character data", () => {
    expect(parseKey(Buffer.from("hello"))).toEqual({ type: "character", value: "hello" });
  });
});

describe("TerminalRenderer", () => {
  it("reads a prompt from the pinned input box", async () => {
    const input = createInput();
    const output = createOutput();
    const renderer = new TerminalRenderer({ input, output });
    const promptPromise = renderer.readPrompt({ title: "Test" });

    input.emit("data", Buffer.from("hi"));
    input.emit("data", Buffer.from("\r"));

    await expect(promptPromise).resolves.toBe("hi");
    expect(stripAnsi(output.text())).toContain("┌ Input ");
    expect(stripAnsi(output.text())).toContain("│ > hi█");
    expect(stripAnsi(output.text())).toContain("╭ User ");
  });

  it("streams assistant text into a colored body card", async () => {
    const input = createInput();
    const output = createOutput();
    const renderer = new TerminalRenderer({ input, output });

    await renderer.renderStream(createStream(["# Hello", "\n- there"]) as never, {
      title: "Test",
      waitForExit: false,
    });

    expect(output.text()).toContain("\x1b[92m╭ Assistant ");
    expect(stripAnsi(output.text())).toContain("│ ╭ Assistant ");
    expect(stripAnsi(output.text())).toContain("│ │ █ Hello");
    expect(stripAnsi(output.text())).toContain("│ │ • there");
    expect(input.rawModes).toEqual([true, false]);
  });

  it("renders submitted prompts as user cards before assistant output", async () => {
    const input = createInput();
    const output = createOutput();
    const renderer = new TerminalRenderer({ input, output });

    await renderer.renderStream(createStream(["hello"]) as never, {
      title: "Test",
      submittedPrompt: "what now?",
      waitForExit: false,
    });

    expect(output.text()).toContain("\x1b[96m╭ User ");
    expect(stripAnsi(output.text())).toContain("what now?");
  });

  it("renders reasoning and tool parts as distinct colored cards", async () => {
    const input = createInput();
    const output = createOutput();
    output.rows = 20;
    const renderer = new TerminalRenderer({ input, output });

    await renderer.renderStream(createMixedStream() as never, {
      title: "Test",
      waitForExit: false,
    });

    expect(output.text()).toContain("\x1b[94m╭ Reasoning ");
    expect(output.text()).toContain("\x1b[95m╭ Tool · weather ");
    expect(stripAnsi(output.text())).toContain("thinking");
    expect(stripAnsi(output.text())).toContain("Input:");
    expect(stripAnsi(output.text())).toContain("Output:");
    expect(stripAnsi(output.text())).toContain('"weather": "sunny"');
  });

  it("renders stream errors into the body box", async () => {
    const input = createInput();
    const output = createOutput();
    const renderer = new TerminalRenderer({ input, output });

    await renderer.renderStream(createErrorStream(new Error("Bad API key")) as never, {
      title: "Test",
      waitForExit: false,
    });

    expect(output.text()).toContain("\x1b[91m╭ Error ");
    expect(output.text()).toContain("Bad API key");
  });

  it("keeps the terminal session open between turns", async () => {
    const input = createInput();
    const output = createOutput();
    const renderer = new TerminalRenderer({ input, output });

    await renderer.renderStream(createStream(["hello"]) as never, {
      title: "Test",
      continueSession: true,
      waitForExit: false,
    });

    expect(output.text()).toContain("Done · Enter another prompt");
    expect(input.rawModes).toEqual([true]);

    const promptPromise = renderer.readPrompt({ title: "Test" });
    input.emit("data", Buffer.from("next"));
    input.emit("data", Buffer.from("\r"));

    await expect(promptPromise).resolves.toBe("next");
    expect(stripAnsi(output.text())).toContain("│ > next█");
  });

  it("fully repaints unchanged lines on resize", async () => {
    const input = createInput();
    const output = createOutput();
    const renderer = new TerminalRenderer({ input, output });
    const promptPromise = renderer.readPrompt({ title: "Test" });

    output.emit("resize");

    expect(output.chunks.at(-1)).toContain("\x1b[H\x1b[2J");
    expect(stripAnsi(output.chunks.at(-1) ?? "")).toContain("┌ Test ");

    input.emit("data", Buffer.from("\r"));
    await expect(promptPromise).resolves.toBe("");
  });

  it("fully repaints unchanged lines when Ctrl+R is pressed", async () => {
    const input = createInput();
    const output = createOutput();
    const renderer = new TerminalRenderer({ input, output });
    const promptPromise = renderer.readPrompt({ title: "Test" });

    input.emit("data", Buffer.from("\u0012"));

    expect(output.chunks.at(-1)).toContain("\x1b[H\x1b[2J");
    expect(stripAnsi(output.chunks.at(-1) ?? "")).toContain("┌ Test ");

    input.emit("data", Buffer.from("\r"));
    await expect(promptPromise).resolves.toBe("");
  });
});

function createInput() {
  const input = new EventEmitter() as TerminalInput & {
    rawModes: boolean[];
    resumeCalls: number;
    pauseCalls: number;
  };

  input.isTTY = true;
  input.rawModes = [];
  input.resumeCalls = 0;
  input.pauseCalls = 0;
  input.setRawMode = (mode) => {
    input.rawModes.push(mode);
    return input;
  };
  input.resume = () => {
    input.resumeCalls += 1;
    return input;
  };
  input.pause = () => {
    input.pauseCalls += 1;
    return input;
  };

  return input;
}

function createOutput() {
  const chunks: string[] = [];
  const output = new EventEmitter() as TerminalOutput & { chunks: string[]; text: () => string };

  output.columns = 40;
  output.rows = 10;
  output.chunks = chunks;
  output.write = (chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  };
  output.text = () => chunks.join("");

  return output;
}

function createStream(chunks: string[]): AgentTUIStreamResult {
  return {
    uiMessageStream: (async function* () {
      yield { type: "start", messageId: "message-1" };
      yield { type: "text-start", id: "text-1" };
      for (const text of chunks) {
        yield { type: "text-delta", id: "text-1", delta: text };
      }
      yield { type: "text-end", id: "text-1" };
      yield { type: "finish" };
    })(),
  };
}

function createMixedStream(): AgentTUIStreamResult {
  return {
    uiMessageStream: (async function* () {
      yield { type: "start", messageId: "message-1" };
      yield { type: "reasoning-start", id: "reasoning-1" };
      yield { type: "reasoning-delta", id: "reasoning-1", delta: "thinking" };
      yield { type: "reasoning-end", id: "reasoning-1" };
      yield {
        type: "tool-input-available",
        toolCallId: "call-1",
        toolName: "weather",
        input: { city: "Berlin" },
      } satisfies UIMessageChunk;
      yield {
        type: "tool-output-available",
        toolCallId: "call-1",
        output: { city: "Berlin", weather: "sunny" },
      } satisfies UIMessageChunk;
      yield { type: "finish" };
    })(),
  };
}

function createErrorStream(error: unknown): AgentTUIStreamResult {
  return {
    uiMessageStream: (async function* () {
      yield {
        type: "error",
        errorText: error instanceof Error ? error.message : String(error),
      };
    })(),
  };
}
