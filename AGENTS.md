# Agent Instructions

Before saying that work is complete, run these checks from the repository root:

```bash
bunx tsc --noEmit
bun run test
bun run format:check
bun run lint
```

If a check cannot be run, mention that explicitly in the final response.

## Changesets

When a change should be released, add a changeset in `.changeset/`:

```markdown
---
"@lgrammel/agent-tui": patch
---

Briefly describe the user-facing change.
```

Use `patch` for fixes and small compatible changes, `minor` for new user-facing features or APIs, and `major` for breaking changes. Do not add changesets for private examples or internal-only changes that do not affect the published package.

Run `bunx changeset status` to verify that the changeset parses and that the intended package will be bumped.
