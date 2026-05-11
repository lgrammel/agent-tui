import { weatherTool } from "../tool/weather-tool";
import { Agent } from "ai";

export const weatherAgent = new Agent({
  model: "openai/gpt-4o",
  system: "You are a helpful assistant.",
  tools: {
    weather: weatherTool,
  },
});

export default weatherAgent;
