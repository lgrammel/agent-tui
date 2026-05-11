# agent-cli-template

Template for running AI SDK agents with Bun in a terminal.

Contains an example weather agent.

## Setup

1. Install [Bun](https://bun.com/)
2. Run `bun i`
3. Add a [Vercel AI Gateway API](https://vercel.com/docs/ai-gateway) key to `.env`

## Example

```bash
bun run index.ts --agent weather "what is the weather in london?"
```

## Development

```bash
bun run format
bun run lint
bun run check
```

## Folders

- `@/agent`: contains agents
- `@/tool`: contains tools

## Usage

You can add your own agent and tools.
You can use this template when creating a new GitHub repository.
