# Features

`@lgrammel/agent-tui` provides a small terminal UI layer for AI SDK agents and compatible streaming
agents.

## Session Runner

`AgentTUI` owns the conversation loop:

- Prompts for input when `run()` is called without an initial prompt.
- Accepts one-shot CLI prompts with `run({ prompt })`.
- Sends the full message history to the agent on each turn.
- Collects assistant text from streamed `text-delta` parts and adds it to the next turn's message history.
- Stops cleanly when input or streaming is interrupted.

The wrapped agent can be an AI SDK `Agent` or any object with this shape:

```ts
{
  stream(options: { messages: UIMessage[] }): {
    uiMessageStream: AsyncIterable<UIMessageChunk> | ReadableStream<UIMessageChunk>;
  };
}
```

## Terminal Renderer

`TerminalRenderer` is the default renderer used by `AgentTUI`.

- Uses the terminal alternate screen while active.
- Shows conversation content above a pinned input or status panel.
- Renders user, assistant, reasoning, tool, and error sections as distinct cards.
- Streams text deltas as they arrive.
- Displays tool calls, tool results, tool errors, and stream errors.
- Supports `Up` and `Down` scrolling for long output.
- Handles terminal resize events.
- Restores terminal raw mode and the normal screen on exit.

Reasoning output is opt-in:

```ts
new TerminalRenderer({ includeReasoning: true });
```

## Markdown Support

Terminal output includes lightweight markdown formatting for common agent responses:

- `#`, `##`, and `###` headings.
- Bulleted and numbered lists.
- Blockquotes.
- Bold, italic, and inline code markers.

This renderer is intentionally small and terminal-focused. It formats common AI responses without
trying to be a complete Markdown implementation.

## Customization Points

You can customize the default terminal renderer with:

- `input`: a custom readable terminal stream.
- `output`: a custom writable terminal stream.
- `includeReasoning`: whether reasoning stream parts are displayed.

You can replace the renderer entirely by passing an object that implements `AgentTUIRenderer`:

```ts
const renderer = {
  async readPrompt() {
    return "hello";
  },
  async renderStream(result) {
    for await (const chunk of result.uiMessageStream) {
      // Render the stream in your own interface.
    }
  },
};
```

## Public Helpers

The package also exports renderer building blocks:

- `parseKey` for terminal key decoding.
- `renderScreen`, `wrapText`, and `clampScrollOffset` for layout.
- `renderMarkdown` for lightweight terminal markdown formatting.
