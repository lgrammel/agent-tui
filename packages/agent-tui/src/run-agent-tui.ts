import { AgentTUIRunner } from "./agent-tui-runner";
import type { TerminalPartDisplayMode } from "./tui/terminal-renderer";
import type { Agent } from "ai";

/**
 * Options for starting an agent in the default terminal UI.
 */
export type RunAgentTUIOptions<
  TAgent extends Agent<any, any, any, any> = Agent<any, any, any, any>,
> = {
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
};

/**
 * Runs an agent in the default terminal UI until the user exits.
 */
export async function runAgentTUI<
  TAgent extends Agent<any, any, any, any> = Agent<any, any, any, any>,
>(options: RunAgentTUIOptions<TAgent>) {
  await new AgentTUIRunner(options).run();
}
