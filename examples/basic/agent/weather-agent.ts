import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { AgentTUIAgent } from "@lgrammel/agent-tui";
import { weatherTool } from "../tool/weather-tool";

export const weatherAgent: AgentTUIAgent = {
  stream({ messages }) {
    return streamText({
      model: openai("gpt-4.1-mini"),
      system:
        "You are a concise weather assistant. Use the weather tool when the user asks about weather, then answer in markdown.",
      messages,
      tools: {
        weather: weatherTool,
      },
    });
  },
};

export default weatherAgent;
