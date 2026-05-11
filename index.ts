import { printStream } from "@/util/print-stream";
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

const result = agent.stream({ prompt: positionals[2]! });

await printStream(result);
