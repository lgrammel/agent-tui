import { openai } from "@ai-sdk/openai";
import { stepCountIs, ToolLoopAgent } from "ai";
import { weatherTool } from "../tool/weather-tool";

export const weatherAgent = new ToolLoopAgent({
  model: openai("gpt-4.1-mini"),
  instructions:
    "You are a concise weather assistant. Use the weather tool when the user asks about weather, then answer in markdown.",
  tools: {
    weather: weatherTool,
  },
  stopWhen: stepCountIs(5),
});

export default weatherAgent;
