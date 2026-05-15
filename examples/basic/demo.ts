import { openai } from "@ai-sdk/openai";
import { runAgentTUI } from "@lgrammel/agent-tui";
import { ToolLoopAgent } from "ai";

await runAgentTUI({
  name: "Demo Agent",
  agent: new ToolLoopAgent({
    model: openai("gpt-5.4-mini"),
    instructions:
      "You are a concise terminal assistant." +
      "Answer in markdown and ask a brief clarifying question when the request is ambiguous.",
  }),
  tools: "collapsed",
  reasoning: "collapsed",
  assistantResponseStats: "tokensPerSecond",
});
