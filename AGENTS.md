# Agent Instructions

Before saying that work is complete, run these checks from the repository root:

```bash
bunx tsc --noEmit
bun run test
bun run format:check
bun run lint
```

If a check cannot be run, mention that explicitly in the final response.
