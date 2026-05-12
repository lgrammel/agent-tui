import { describe, expect, it } from "vitest";
import { renderAgentUI } from "./agent-tui";
import { MockScreen, MockUserInput } from "./test/mock-terminal";
import { createDeferred } from "./util/deferred";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { ToolLoopAgent, tool } from "ai";
import { z } from "zod";

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
