import type { AgentTUIAgent, AgentTUIStreamPart } from "@lgrammel/agent-tui";

export const weatherAgent: AgentTUIAgent = {
  async stream({ prompt }) {
    return {
      fullStream: streamWeatherResponse(prompt),
    };
  },
};

async function* streamWeatherResponse(prompt: string): AsyncIterable<AgentTUIStreamPart> {
  const city = extractCity(prompt);
  const weather = getWeather(city);

  const response = [
    "# Weather Report\n\n",
    `- **City:** ${weather.city}\n`,
    `- **Temperature:** ${weather.temperature}°F\n`,
    `- **Conditions:** ${weather.weather}\n\n`,
    "> This local demo agent streams markdown without calling an external model.\n",
  ];

  for (const text of response) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    yield { type: "text-delta", text };
  }
}

function extractCity(prompt: string) {
  const match = /(?:in|for)\s+([a-z\s]+)$/i.exec(prompt.trim());

  return match?.[1]?.trim() || "San Francisco";
}

function getWeather(city: string) {
  const weatherOptions = ["sunny", "cloudy", "rainy", "snowy", "windy"];
  const weather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];

  return { city, temperature: 72, weather };
}

export default weatherAgent;
