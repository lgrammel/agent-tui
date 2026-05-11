export type TerminalFrameOutput = {
  write(chunk: string | Uint8Array): boolean;
};

export type TerminalFrameBufferOptions = {
  useSynchronizedUpdates?: boolean;
};

const escape = "\x1b";
const cursorHome = `${escape}[H`;
const clearScreen = `${escape}[2J`;
const clearLine = `${escape}[2K`;
const synchronizeStart = `${escape}[?2026h`;
const synchronizeEnd = `${escape}[?2026l`;

type FrameSnapshot = {
  lines: string[];
};

export class TerminalFrameBuffer {
  readonly #output: TerminalFrameOutput;
  readonly #useSynchronizedUpdates: boolean;

  #previousFrame?: FrameSnapshot;

  constructor(output: TerminalFrameOutput, options?: TerminalFrameBufferOptions) {
    this.#output = output;
    this.#useSynchronizedUpdates = options?.useSynchronizedUpdates ?? true;
  }

  present(frame: string) {
    const nextFrame = snapshotFrame(frame);
    const update = this.#previousFrame
      ? diffFrame(this.#previousFrame, nextFrame)
      : `${cursorHome}${clearScreen}${frame}`;

    this.#previousFrame = nextFrame;

    if (update.length === 0) {
      return;
    }

    this.#writeUpdate(update);
  }

  reset() {
    this.#previousFrame = undefined;
  }

  #writeUpdate(update: string) {
    if (!this.#useSynchronizedUpdates) {
      this.#output.write(update);
      return;
    }

    this.#output.write(`${synchronizeStart}${update}${synchronizeEnd}`);
  }
}

function snapshotFrame(frame: string): FrameSnapshot {
  return { lines: frame.split("\n") };
}

function diffFrame(previousFrame: FrameSnapshot, nextFrame: FrameSnapshot) {
  let output = "";
  const lineCount = Math.max(previousFrame.lines.length, nextFrame.lines.length);

  for (let index = 0; index < lineCount; index++) {
    const line = nextFrame.lines[index];

    if (previousFrame.lines[index] === line) {
      continue;
    }

    output += `${escape}[${index + 1};1H${clearLine}${line ?? ""}`;
  }

  return output;
}
