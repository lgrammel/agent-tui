import { AgentTUI } from "@lgrammel/agent-tui";
import type { AgentTUIAgent } from "@lgrammel/agent-tui";
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

const agent = (await import(agentPath)).default as AgentTUIAgent;

const agentTUI = new AgentTUI(agent);

await agentTUI.run({ prompt: positionals[2] });
