# @lgrammel/agent-tui

## 0.4.1

### Patch Changes

- 6442142: Show tool execution and next-step processing statuses while agent streams continue.

  Allow configuring the context window size so the terminal UI can show token usage as a percentage.

## 0.4.0

### Minor Changes

- 5f0835b: Support interrupting active streams with Ctrl+C, including aborting the underlying agent request and cleaning up the terminal renderer immediately.
- 5f0835b: Surface total token usage in assistant response metadata and show the conversation token count in the terminal UI frame.

### Patch Changes

- 1d48500: Show processing input status until assistant streaming output begins.
