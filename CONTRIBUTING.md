# Contributing

This repository currently uses Bun for workspace scripts and the included example.

## Setup

Install dependencies:

```bash
bun i
```

## Run The Example

Copy the example environment file and add an OpenAI API key:

```bash
cp examples/basic/.env.example examples/basic/.env
```

Run the weather agent:

```bash
bun run weather
```

The example source is in `examples/basic/index.ts`.

## Checks

```bash
bun run format
bun run lint
bun run check
bun run test
```

`bun run check` runs formatting check and lint.

## Layout

- `packages/agent-tui`: package source
- `examples/basic`: weather agent example
