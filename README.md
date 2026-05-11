# agent-tui

Run AI SDK agents in an interactive Bun terminal UI.

`@lgrammel/agent-tui` wraps an AI SDK agent, streams its output into a full-screen terminal
interface, and keeps the conversation going across turns. This repo is a Bun monorepo with the
reusable package in `packages/agent-tui` and a weather-agent example in `examples/basic`.

## Features

- Interactive prompt input with a pinned input/status area.
- Multi-turn sessions that preserve user and assistant message history between agent calls.
- Streaming assistant output rendered as terminal cards.
- Tool call, tool result, tool error, and stream error cards.
- Blue reasoning cards for models that emit thinking/reasoning stream parts.
- Arrow-key scrolling for long conversations.
- Basic markdown rendering for headings, bullets, numbered lists, blockquotes, bold, italic, and inline code.
- Custom terminal input/output streams for tests or embedded CLIs.
- Custom renderer support for replacing the default terminal UI.

See `docs/features.md` for more detail about the session runner, renderer, markdown support, and
customization points.

## Quick Start

Install dependencies:

```bash
bun i
```

Copy the example environment file and add an OpenAI API key:

```bash
cp examples/basic/.env.example examples/basic/.env
```

Run the included weather example:

```bash
bun run weather "what is the weather in london?"
```

You can also start the TUI without an initial prompt and type into the terminal:

```bash
bun run weather
```

## Usage

Import `AgentTUI` from `@lgrammel/agent-tui` and pass it an AI SDK agent or any object with a
compatible `stream({ messages })` method.

```ts
import { AgentTUI } from "@lgrammel/agent-tui";
import { openai } from "@ai-sdk/openai";
import { stepCountIs, ToolLoopAgent } from "ai";

const agent = new ToolLoopAgent({
  model: openai("gpt-4.1-mini"),
  instructions: "You are a concise assistant.",
  stopWhen: stepCountIs(5),
});

const tui = new AgentTUI(agent, {
  title: "Weather Agent",
});

await tui.run();
```

Pass an initial prompt for CLI-style commands. After the response streams, the default renderer keeps
the session open so the user can ask follow-up questions.

```ts
await tui.run({
  prompt: "what is the weather in london?",
});
```

## Terminal Controls

- Type a prompt and press `Enter` to submit it.
- Press `Up` and `Down` to scroll through the conversation.
- Press `Ctrl+C` while entering a prompt or streaming to stop the session.
- When using `TerminalRenderer.renderStream()` directly with exit waiting enabled, press `q` or
  `Ctrl+C` after a completed render to exit.

## Rendering Thinking

Thinking/reasoning stream parts render automatically as blue sections whenever the agent stream
contains them.

## Custom Renderers

`AgentTUI` accepts a custom renderer when you want to keep the session orchestration but render
somewhere other than the default terminal UI.

```ts
import type { AgentTUIRenderer } from "@lgrammel/agent-tui";

const renderer: AgentTUIRenderer = {
  async readPrompt() {
    return "hello";
  },
  async renderStream(result) {
    for await (const chunk of result.uiMessageStream) {
      // Render text, tool calls, errors, or reasoning parts in your own UI.
    }
  },
};
```

If a renderer does not implement `readPrompt`, call `run({ prompt })` with an initial prompt.

## Package Exports

- `AgentTUI`: session runner for AI SDK agents or compatible streaming agents.
- `TerminalRenderer`: default full-screen terminal renderer.
- `parseKey`: terminal key decoder used by the renderer.
- `renderScreen`, `wrapText`, and `clampScrollOffset`: layout helpers for terminal UIs.
- `renderMarkdown`: lightweight markdown-to-terminal formatting helper.
- Type exports for agents, renderers, session options, terminal input/output, and renderer options.

## Example Project

The basic example defines a `ToolLoopAgent` with a mock weather tool in `examples/basic/index.ts`.

## Development

```bash
bun run format
bun run lint
bun run check
bun run test
```

## Repository Layout

- `packages/agent-tui`: reusable terminal UI package.
- `examples/basic`: weather agent example.
