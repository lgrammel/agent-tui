import { tool } from "ai";
import { z } from "zod";

export const weatherTool = tool({
  description: "Get the weather in a location",
  inputSchema: z.object({ city: z.string() }),
  async execute({ city }) {
    const weatherOptions = ["sunny", "cloudy", "rainy", "snowy", "windy"];
    const weather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];

    return { city, temperature: 72, weather };
  },
});
