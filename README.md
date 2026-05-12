# agent-tui

Run AI SDK agents in a polished terminal UI.

`@lgrammel/agent-tui` gives AI SDK 7 agents an interactive, full-screen terminal
interface with streaming output, tool cards, approvals, markdown rendering, scrollback, and a
pinned input box.

<img src="https://raw.githubusercontent.com/lgrammel/agent-tui/main/docs/assets/agent-tui-screenshot.png" alt="agent-tui terminal interface showing a weather agent tool call and response" width="100%" />

## Features

- Run AI SDK `Agent` and `ToolLoopAgent` instances with one function call.
- Keep multi-turn conversations by sending the full UI message history on each turn.
- Stream assistant text, reasoning, tool input/output, tool approvals, sources, files, and errors.
- Render tool calls as readable cards with optional collapsed tool details.
- Use the terminal alternate screen with resize handling, raw-mode cleanup, scrollback, and a pinned input/status area.
- Format common markdown, including headings, lists, blockquotes, bold, italic, and inline code.

## Install

Install the TUI package plus the AI SDK provider packages your agent uses:

```bash
npm install @lgrammel/agent-tui
pnpm add @lgrammel/agent-tui
yarn add @lgrammel/agent-tui
bun add @lgrammel/agent-tui
```

For the example below, also install `@ai-sdk/openai` and `zod`, and provide an
`OPENAI_API_KEY`.

## Usage

```ts
import { openai } from "@ai-sdk/openai";
import { runAgentTUI } from "@lgrammel/agent-tui";
import { ToolLoopAgent, tool } from "ai";
import { z } from "zod";

await runAgentTUI({
  name: "Weather Agent",
  collapseTools: false,
  agent: new ToolLoopAgent({
    model: openai("gpt-5.4-mini"),
    instructions:
      "You are a concise weather assistant. Use the weather tool when the user asks about weather, then answer in markdown.",
    tools: {
      weather: tool({
        description: "Get the weather in a location",
        inputSchema: z.object({ city: z.string() }),
        execute({ city }) {
          const weatherOptions = ["sunny", "cloudy", "rainy", "snowy", "windy"];
          const weather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];

          return { city, temperature: 72, weather };
        },
      }),
    },
    toolApproval: {
      weather: "user-approval",
    },
  }),
});
```

`runAgentTUI` opens the terminal UI, reads prompts from the user, streams each response, asks for
tool approvals when the agent requests them, and continues until the user exits.

## API

```ts
type RunAgentTUIOptions<TAgent extends Agent<any, any, any, any> = Agent<any, any, any, any>> = {
  agent: TAgent;
  name: string;
  collapseTools?: boolean;
};

function runAgentTUI<TAgent extends Agent<any, any, any, any>>(
  options: RunAgentTUIOptions<TAgent>,
): Promise<void>;
```

- `agent`: An AI SDK 7 `Agent` or `ToolLoopAgent`.
- `name`: The title shown in the terminal frame.
- `collapseTools`: When `true`, tool cards show only their name and status by default.

`runAgentTUI` also accepts compatible custom agents that expose a `stream()` method returning
either a UI message stream or a text stream:

```ts
type CompatibleAgent = {
  stream(options: {
    messages: UIMessage[];
  }): Promise<CompatibleStreamResult> | CompatibleStreamResult;
};

type CompatibleStreamResult =
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
```

Text streams are converted to UI message chunks before rendering.

## Controls

- Type a prompt and press `Enter` to submit it.
- Press `y` or `n` when a tool approval prompt is shown.
- Press `Up` and `Down` to scroll the transcript.
- Press `Ctrl+R` to force a full repaint.
- Press `Ctrl+C` to stop the session.
- When using `TerminalRenderer.renderStream()` directly with exit waiting enabled, press `q` or
  `Ctrl+C` to exit after rendering completes.

## Lower-Level Rendering

The package also exports the terminal renderer and layout helpers for tests, custom runners, or
non-interactive rendering:

```ts
import {
  TerminalFrameBuffer,
  TerminalRenderer,
  clampScrollOffset,
  parseKey,
  renderMarkdown,
  renderScreen,
  wrapText,
} from "@lgrammel/agent-tui";
```

These APIs let you provide custom terminal input/output streams, render a single stream yourself,
or reuse the markdown and screen-layout primitives.

## Example App

This repository includes a weather agent in `examples/basic`.

```bash
bun i
cp examples/basic/.env.example examples/basic/.env
bun run weather
```

Add your OpenAI API key to `examples/basic/.env` before running the example. See
`CONTRIBUTING.md` for repository setup, checks, and release commands.
