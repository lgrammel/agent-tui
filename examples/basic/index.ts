import { openai } from "@ai-sdk/openai";
import { AgentTUI } from "@lgrammel/agent-tui";
import { ToolLoopAgent, tool } from "ai";
import { z } from "zod";

const weatherTool = tool({
  description: "Get the weather in a location",
  inputSchema: z.object({ city: z.string() }),
  async execute({ city }) {
    const weatherOptions = ["sunny", "cloudy", "rainy", "snowy", "windy"];
    const weather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];

    return { city, temperature: 72, weather };
  },
});

const agent = new ToolLoopAgent({
  model: openai("gpt-4.1-mini"),
  instructions:
    "You are a concise weather assistant. Use the weather tool when the user asks about weather, then answer in markdown.",
  tools: {
    weather: weatherTool,
  },
});

const agentTUI = new AgentTUI(agent);

await agentTUI.run({ prompt: Bun.argv.slice(2).join(" ") || undefined });
