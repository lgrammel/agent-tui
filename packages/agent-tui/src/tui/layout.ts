import { renderMarkdown } from "./markdown";

const horizontal = "─";

export type TUIScreenState = {
  width: number;
  height: number;
  title: string;
  body: string;
  input: string;
  inputActive: boolean;
  scrollOffset: number;
  status?: string;
};

export function renderScreen(state: TUIScreenState): string {
  const width = Math.max(20, state.width);
  const height = Math.max(8, state.height);
  const inputHeight = 3;
  const bodyHeight = height - inputHeight;
  const contentWidth = width - 4;
  const bodyContentHeight = bodyHeight - 2;

  const bodyLines = wrapText(renderMarkdown(state.body), contentWidth);
  const maxScrollOffset = Math.max(0, bodyLines.length - bodyContentHeight);
  const scrollOffset = Math.min(Math.max(0, state.scrollOffset), maxScrollOffset);
  const start = Math.max(0, bodyLines.length - bodyContentHeight - scrollOffset);
  const visibleBody = bodyLines.slice(start, start + bodyContentHeight);

  while (visibleBody.length < bodyContentHeight) {
    visibleBody.push("");
  }

  const lines = [
    topBorder(width, state.title),
    ...visibleBody.map((line) => boxLine(line, width)),
    bottomBorder(width),
    topBorder(width, state.inputActive ? "Input" : "Status"),
    boxLine(
      state.inputActive
        ? `> ${state.input}`
        : (state.status ?? "Streaming... ↑/↓ scroll · Ctrl+C quit"),
      width,
    ),
    bottomBorder(width),
  ];

  return lines.join("\n");
}

export function wrapText(input: string, width: number): string[] {
  if (width <= 0) {
    return [""];
  }

  const output: string[] = [];

  for (const rawLine of input.split("\n")) {
    if (rawLine.length === 0) {
      output.push("");
      continue;
    }

    let remaining = rawLine;

    while (remaining.length > width) {
      const breakAt = findBreakPoint(remaining, width);
      output.push(remaining.slice(0, breakAt).trimEnd());
      remaining = remaining.slice(breakAt).trimStart();
    }

    output.push(remaining);
  }

  return output;
}

export function clampScrollOffset(
  scrollOffset: number,
  body: string,
  bodyHeight: number,
  width: number,
): number {
  const bodyContentHeight = Math.max(1, bodyHeight - 2);
  const bodyLines = wrapText(renderMarkdown(body), Math.max(1, width - 4));
  const maxScrollOffset = Math.max(0, bodyLines.length - bodyContentHeight);

  return Math.min(Math.max(0, scrollOffset), maxScrollOffset);
}

function findBreakPoint(input: string, width: number): number {
  const slice = input.slice(0, width + 1);
  const lastSpace = slice.lastIndexOf(" ");

  if (lastSpace > 0) {
    return lastSpace;
  }

  return width;
}

function topBorder(width: number, title: string): string {
  const label = ` ${title} `;
  const remaining = Math.max(0, width - 2 - label.length);

  return `┌${label}${horizontal.repeat(remaining)}┐`;
}

function bottomBorder(width: number): string {
  return `└${horizontal.repeat(width - 2)}┘`;
}

function boxLine(line: string, width: number): string {
  const contentWidth = width - 4;
  const visible = line.slice(0, contentWidth);
  const padding = " ".repeat(Math.max(0, contentWidth - visible.length));

  return `│ ${visible}${padding} │`;
}
