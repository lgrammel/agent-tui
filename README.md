# agent-tui

Run AI SDK agents with Bun in a terminal.

This repo is a Bun monorepo with the package in `packages/agent-tui` and a basic weather agent example in
`examples/basic`.

## Setup

1. Install [Bun](https://bun.com/)
2. Run `bun i`
3. Copy `examples/basic/.env.example` to `examples/basic/.env` and add an OpenAI API key

## Example

```bash
bun run weather "what is the weather in london?"
```

## Development

```bash
bun run format
bun run lint
bun run check
```

## Folders

- `packages/agent-tui`: contains the reusable terminal UI package
- `examples/basic`: contains a weather agent example

## Usage

Import `AgentTUI` from `@lgrammel/agent-tui` and pass it an AI SDK agent.
