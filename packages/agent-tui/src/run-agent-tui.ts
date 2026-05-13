import { AgentTUIRunner } from "./agent-tui-runner";
import type { AssistantResponseStatsMode, TerminalPartDisplayMode } from "./tui/terminal-renderer";
import type { Agent } from "ai";

/**
 * An agent that is compatible with the terminal UI.
 *
 * It has no call options and no structured output.
 */
export type AgentTUIAgent = Agent<never, any, any, never>;

/**
 * Options for starting an agent in the default terminal UI.
 */
export type RunAgentTUIOptions<TAgent extends AgentTUIAgent = AgentTUIAgent> = {
  /**
   * The agent to run.
   */
  agent: TAgent;

  /**
   * The title shown in the terminal UI.
   */
  name: string;

  /**
   * How tool calls should render.
   */
  tools?: TerminalPartDisplayMode;

  /**
   * How reasoning parts should render.
   */
  reasoning?: TerminalPartDisplayMode;

  /**
   * Which statistic to show in assistant response headers.
   *
   * @default "tokensPerSecond"
   */
  assistantResponseStats?: AssistantResponseStatsMode;
};

/**
 * Runs an agent in the default terminal UI until the user exits.
 */
export async function runAgentTUI<TAgent extends AgentTUIAgent = AgentTUIAgent>(
  options: RunAgentTUIOptions<TAgent>,
) {
  await new AgentTUIRunner(options).run();
}
