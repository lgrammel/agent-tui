# agent-tui

Run AI SDK agents in a terminal UI.

`@lgrammel/agent-tui` provides a TUI for AI SDK 7 agents.

## Features

- Runs AI SDK `Agent` and `ToolLoopAgent` instances.
- Sends full message history on each turn.
- Streams assistant text, reasoning, tools, sources, files, and errors.
- Uses the terminal alternate screen with a pinned input/status area.
- Supports resize handling, raw-mode cleanup, and `Up`/`Down` scrolling.
- Formats common markdown: headings, lists, blockquotes, bold, italic, and inline code.

## Install

Use any package manager:

```bash
npm install @lgrammel/agent-tui
pnpm add @lgrammel/agent-tui
yarn add @lgrammel/agent-tui
bun add @lgrammel/agent-tui
```

## Usage

```ts
import { openai } from "@ai-sdk/openai";
import { runAgentTUI } from "@lgrammel/agent-tui";
import { ToolLoopAgent, tool } from "ai";
import { z } from "zod";

await runAgentTUI({
  name: "Weather Agent",
  agent: new ToolLoopAgent({
    model: openai("gpt-5.4-mini"),
    instructions:
      "You are a concise weather assistant. Use the weather tool when the user asks about weather.",
    tools: {
      weather: tool({
        description: "Get the weather in a location",
        inputSchema: z.object({ city: z.string() }),
        execute({ city }) {
          return { city, temperature: 72, weather: "sunny" };
        },
      }),
    },
  }),
});
```

## Compatible Agents

`runAgentTUI` accepts AI SDK 7 `Agent` instances and objects with this shape:

```ts
type CompatibleAgent = {
  stream(options: { messages: UIMessage[] }):
    | {
        uiMessageStream: AsyncIterable<UIMessageChunk> | ReadableStream<UIMessageChunk>;
      }
    | {
        fullStream: AsyncIterable<TextStreamPart<ToolSet>>;
        toUIMessageStream?: (options?: {
          originalMessages?: UIMessage[];
          generateMessageId?: () => string;
        }) => AsyncIterable<UIMessageChunk> | ReadableStream<UIMessageChunk>;
      };
};
```

Text streams are converted to UI message chunks before rendering.

## Controls

- Type a prompt and press `Enter` to submit it.
- Press `Up` and `Down` to scroll.
- Press `Ctrl+C` to stop the session.
- When using `TerminalRenderer.renderStream()` directly with exit waiting enabled, press `q` or
  `Ctrl+C` to exit after rendering completes.

## Example

The repository includes a weather agent example in `examples/basic`.

See `CONTRIBUTING.md` for repository setup, checks, and example commands.
