import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { renderAgentUI } from "./agent-tui";
import type { TerminalInput, TerminalOutput } from "./tui/terminal-renderer";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { ToolLoopAgent, tool } from "ai";
import { z } from "zod";

const ansiControlSequencePattern = new RegExp(
  `^${String.fromCharCode(27)}\\[([0-9?;]*)([ -/]*)([@-~])`,
);

describe("renderAgentUI integration", () => {
  it("drives a ToolLoopAgent with mock terminal input and screen snapshots", async () => {
    const screen = new MockScreen({ columns: 54, rows: 14 });
    const userInput = new MockUserInput();
    const weatherResult = createDeferred<{ city: string; temperature: number; weather: string }>();
    const agent = new ToolLoopAgent({
      model: createWeatherModel(),
      instructions: "Use the weather tool when asked about weather.",
      tools: {
        weather: tool({
          description: "Get the weather in a location",
          inputSchema: z.object({ city: z.string() }),
          async execute({ city }) {
            return await weatherResult.promise.then((result) => ({ ...result, city }));
          },
        }),
      },
    });
    const run = renderAgentUI({
      name: "Weather Agent",
      agent,
      "~internal": { screen, userInput },
    });

    try {
      await screen.waitForText("> █");
      expect(screen.snapshot()).toMatchInlineSnapshot(`
        "┌ Weather Agent ─────────────────────────────────────┐
        │ Waiting for input...                               │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        └────────────────────────────────────────────────────┘
        ┌ Input ─────────────────────────────────────────────┐
        │ > █                                                │
        └────────────────────────────────────────────────────┘"
      `);

      userInput.type("weather in Berlin");
      await screen.waitForText("> weather in Berlin");
      expect(screen.snapshot()).toMatchInlineSnapshot(`
        "┌ Weather Agent ─────────────────────────────────────┐
        │ Waiting for input...                               │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        │                                                    │
        └────────────────────────────────────────────────────┘
        ┌ Input ─────────────────────────────────────────────┐
        │ > weather in Berlin█                               │
        └────────────────────────────────────────────────────┘"
      `);

      userInput.enter();
      await screen.waitForText("Status: running");
      expect(screen.snapshot()).toMatchInlineSnapshot(`
        "┌ Weather Agent ─────────────────────────────────────┐
        │ │ weather in Berlin                              │ │
        │ ╰────────────────────────────────────────────────╯ │
        │ ╭ Tool · weather ────────────────────────────────╮ │
        │ │ Status: running                                │ │
        │ │ Input:                                         │ │
        │ │ {                                              │ │
        │ │   "city": "Berlin"                             │ │
        │ │ }                                              │ │
        │ ╰────────────────────────────────────────────────╯ │
        └────────────────────────────────────────────────────┘
        ┌ Status ────────────────────────────────────────────┐
        │ Streaming... ↑/↓ scroll · Ctrl+C quit              │
        └────────────────────────────────────────────────────┘"
      `);

      weatherResult.resolve({ city: "Berlin", temperature: 72, weather: "sunny" });
      await screen.waitForText("Berlin is sunny and 72F.");
      await screen.waitForText("┌ Input");
      expect(screen.snapshot()).toMatchInlineSnapshot(`
        "┌ Weather Agent ─────────────────────────────────────┐
        │ │ {                                              │ │
        │ │   "city": "Berlin",                            │ │
        │ │   "temperature": 72,                           │ │
        │ │   "weather": "sunny"                           │ │
        │ │ }                                              │ │
        │ ╰────────────────────────────────────────────────╯ │
        │ ╭ Assistant ─────────────────────────────────────╮ │
        │ │ Berlin is sunny and 72F.                       │ │
        │ ╰────────────────────────────────────────────────╯ │
        └────────────────────────────────────────────────────┘
        ┌ Input ─────────────────────────────────────────────┐
        │ > █                                                │
        └────────────────────────────────────────────────────┘"
      `);

      screen.resize(64, 16);
      await screen.waitForText("┌ Weather Agent");
      expect(screen.snapshot()).toMatchInlineSnapshot(`
        "┌ Weather Agent ───────────────────────────────────────────────┐
        │ │                                                          │ │
        │ │ Output:                                                  │ │
        │ │ {                                                        │ │
        │ │   "city": "Berlin",                                      │ │
        │ │   "temperature": 72,                                     │ │
        │ │   "weather": "sunny"                                     │ │
        │ │ }                                                        │ │
        │ ╰──────────────────────────────────────────────────────────╯ │
        │ ╭ Assistant ───────────────────────────────────────────────╮ │
        │ │ Berlin is sunny and 72F.                                 │ │
        │ ╰──────────────────────────────────────────────────────────╯ │
        └──────────────────────────────────────────────────────────────┘
        ┌ Input ───────────────────────────────────────────────────────┐
        │ > █                                                          │
        └──────────────────────────────────────────────────────────────┘"
      `);
    } finally {
      userInput.ctrlC();
      await run;
    }
  });
});

function createWeatherModel() {
  let callCount = 0;

  return new MockLanguageModelV4({
    doStream: async () => {
      callCount += 1;

      if (callCount === 1) {
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              {
                type: "response-metadata",
                id: "response-1",
                modelId: "mock-model",
                timestamp: new Date(0),
              },
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "weather",
                input: '{ "city": "Berlin" }',
              },
              {
                ...finishChunk(),
                finishReason: { unified: "tool-calls", raw: undefined },
              },
            ],
            chunkDelayInMs: null,
            initialDelayInMs: null,
          }),
        };
      }

      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "response-metadata",
              id: "response-2",
              modelId: "mock-model",
              timestamp: new Date(0),
            },
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: "Berlin is sunny and 72F." },
            { type: "text-end", id: "text-1" },
            finishChunk(),
          ],
          chunkDelayInMs: null,
          initialDelayInMs: null,
        }),
      };
    },
  });
}

function finishChunk() {
  return {
    type: "finish" as const,
    finishReason: { unified: "stop" as const, raw: "stop" },
    usage: {
      inputTokens: {
        total: 3,
        noCache: 3,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 10,
        text: 10,
        reasoning: undefined,
      },
    },
    providerMetadata: {},
  };
}

class MockUserInput extends EventEmitter implements TerminalInput {
  isTTY = true;
  rawModes: boolean[] = [];
  resumeCalls = 0;
  pauseCalls = 0;

  setRawMode(mode: boolean) {
    this.rawModes.push(mode);
    return this;
  }

  resume() {
    this.resumeCalls += 1;
    return this;
  }

  pause() {
    this.pauseCalls += 1;
    return this;
  }

  type(text: string) {
    this.emit("data", Buffer.from(text));
  }

  enter() {
    this.emit("data", Buffer.from("\r"));
  }

  ctrlC() {
    this.emit("data", Buffer.from("\u0003"));
  }
}

class MockScreen extends EventEmitter implements TerminalOutput {
  columns: number;
  rows: number;
  #rawOutput = "";
  #lines: string[] = [];
  #cursorLine = 0;
  #cursorColumn = 0;
  #waiters: Array<{
    text: string;
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = [];

  constructor({ columns, rows }: { columns: number; rows: number }) {
    super();
    this.columns = columns;
    this.rows = rows;
  }

  write(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ) {
    const text = String(chunk);
    this.#rawOutput += text;
    this.#apply(text);

    if (typeof encodingOrCallback === "function") {
      encodingOrCallback();
    }
    callback?.();

    this.#resolveWaiters();
    return true;
  }

  resize(columns: number, rows: number) {
    this.columns = columns;
    this.rows = rows;
    this.emit("resize");
  }

  snapshot() {
    return this.#lines.join("\n");
  }

  rawOutput() {
    return this.#rawOutput;
  }

  async waitForText(text: string, timeoutMs = 1000, getDebugOutput = () => this.snapshot()) {
    if (this.snapshot().includes(text)) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const waiter = {
        text,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.#waiters = this.#waiters.filter((candidate) => candidate !== waiter);
          reject(
            new Error(`Timed out waiting for screen text: ${text}\n\nScreen:\n${getDebugOutput()}`),
          );
        }, timeoutMs),
      };
      this.#waiters.push(waiter);
    });
  }

  #resolveWaiters() {
    const snapshot = this.snapshot();

    for (const waiter of this.#waiters.slice()) {
      if (!snapshot.includes(waiter.text)) {
        continue;
      }

      clearTimeout(waiter.timeout);
      this.#waiters = this.#waiters.filter((candidate) => candidate !== waiter);
      waiter.resolve();
    }
  }

  #apply(input: string) {
    let index = 0;

    while (index < input.length) {
      if (input[index] === "\x1b") {
        const nextIndex = this.#applyEscape(input, index);

        if (nextIndex > index) {
          index = nextIndex;
          continue;
        }
      }

      const character = input[index];
      index += 1;

      if (character === "\n") {
        this.#cursorLine += 1;
        this.#cursorColumn = 0;
        continue;
      }

      if (character === "\r") {
        this.#cursorColumn = 0;
        continue;
      }

      this.#writeCharacter(character);
    }
  }

  #applyEscape(input: string, startIndex: number) {
    const match = input.slice(startIndex).match(ansiControlSequencePattern);

    if (!match) {
      return startIndex;
    }

    const [sequence, rawParameters, , command] = match;
    const parameters = rawParameters ? rawParameters.split(";") : [];

    if (command === "H" && parameters.length === 0) {
      this.#cursorLine = 0;
      this.#cursorColumn = 0;
    } else if (command === "J" && parameters[0] === "2") {
      this.#lines = [];
    } else if (command === "K" && parameters[0] === "2") {
      this.#lines[this.#cursorLine] = "";
      this.#cursorColumn = 0;
    } else if (command === "H") {
      this.#cursorLine = Number(parameters[0] ?? 1) - 1;
      this.#cursorColumn = Number(parameters[1] ?? 1) - 1;
    }

    return startIndex + sequence.length;
  }

  #writeCharacter(character: string) {
    const line = this.#lines[this.#cursorLine] ?? "";
    const nextLine =
      line.slice(0, this.#cursorColumn) +
      character +
      line.slice(this.#cursorColumn + character.length);
    this.#lines[this.#cursorLine] = nextLine;
    this.#cursorColumn += character.length;
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}
