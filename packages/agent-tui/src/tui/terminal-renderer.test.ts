import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  parseKey,
  TerminalRenderer,
  type TerminalInput,
  type TerminalOutput,
} from "./terminal-renderer";

describe("parseKey", () => {
  it("decodes terminal control keys", () => {
    expect(parseKey(Buffer.from("\x1B[A"))).toEqual({ type: "up" });
    expect(parseKey(Buffer.from("\x1B[B"))).toEqual({ type: "down" });
    expect(parseKey(Buffer.from("\u007f"))).toEqual({ type: "backspace" });
    expect(parseKey(Buffer.from("\r"))).toEqual({ type: "enter" });
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
    expect(output.text()).toContain("┌ Input ");
    expect(output.text()).toContain("│ > hi");
  });

  it("streams text deltas into the body box", async () => {
    const input = createInput();
    const output = createOutput();
    const renderer = new TerminalRenderer({ input, output });

    await renderer.renderStream(createStream(["# Hello", "\n- there"]) as never, {
      title: "Test",
      waitForExit: false,
    });

    expect(output.text()).toContain("│ █ Hello");
    expect(output.text()).toContain("│ • there");
    expect(input.rawModes).toEqual([true, false]);
  });

  it("renders stream errors into the body box", async () => {
    const input = createInput();
    const output = createOutput();
    const renderer = new TerminalRenderer({ input, output });

    await renderer.renderStream(createErrorStream(new Error("Bad API key")) as never, {
      title: "Test",
      waitForExit: false,
    });

    expect(output.text()).toContain("Error: Bad API key");
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
    expect(output.text()).toContain("│ > next");
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
  const output = new EventEmitter() as TerminalOutput & { text: () => string };

  output.columns = 40;
  output.rows = 10;
  output.write = (chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  };
  output.text = () => chunks.join("");

  return output;
}

function createStream(chunks: string[]) {
  return {
    fullStream: (async function* () {
      for (const text of chunks) {
        yield { type: "text-delta", text };
      }
    })(),
  };
}

function createErrorStream(error: unknown) {
  return {
    fullStream: (async function* () {
      yield { type: "error", error };
    })(),
  };
}
