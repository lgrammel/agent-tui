import { AgentTUI } from "@lgrammel/agent-tui";
import type { Agent, ToolSet } from "ai";
import { parseArgs } from "util";

const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    agent: { type: "string" },
  },
  strict: true,
  allowPositionals: true,
});

const agentPath = `./agent/${values.agent}-agent.ts`;

const agent = (await import(agentPath)).default as Agent<ToolSet, unknown, unknown>;

const agentTUI = new AgentTUI(agent);

await agentTUI.run({ prompt: positionals[2]! });
