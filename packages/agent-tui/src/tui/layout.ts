import { renderMarkdown } from "./markdown";

const horizontal = "─";
const ansiEscape = String.fromCharCode(27);
const ansiPattern = new RegExp(`${ansiEscape}\\[[0-?]*[ -/]*[@-~]`, "g");
const ansiPrefixPattern = new RegExp(`^${ansiEscape}\\[[0-?]*[ -/]*[@-~]`);

export type TUIScreenState = {
  width: number;
  height: number;
  title: string;
  body: string;
  input: string;
  inputActive: boolean;
  inputCursorVisible?: boolean;
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
        ? `> ${state.input}${state.inputCursorVisible === false ? " " : "█"}`
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

    while (visibleLength(remaining) > width) {
      const breakAt = findBreakPoint(remaining, width);
      output.push(remaining.slice(0, breakAt).trimEnd());
      remaining = remaining.slice(breakAt).trimStart();
    }

    output.push(remaining);
  }

  return output;
}

export function stripAnsi(input: string): string {
  return input.replaceAll(ansiPattern, "");
}

export function visibleLength(input: string): number {
  let width = 0;
  let index = 0;

  while (index < input.length) {
    const ansiMatch = input.slice(index).match(ansiPrefixPattern);

    if (ansiMatch) {
      index += ansiMatch[0].length;
      continue;
    }

    const codePoint = input.codePointAt(index);

    if (codePoint == null) {
      break;
    }

    const character = String.fromCodePoint(codePoint);
    width += codePointWidth(codePoint);
    index += character.length;
  }

  return width;
}

export function sliceVisible(input: string, width: number): string {
  if (width <= 0) {
    return "";
  }

  let output = "";
  let visible = 0;
  let index = 0;

  while (index < input.length && visible < width) {
    const ansiMatch = input.slice(index).match(ansiPrefixPattern);

    if (ansiMatch) {
      output += ansiMatch[0];
      index += ansiMatch[0].length;
      continue;
    }

    const codePoint = input.codePointAt(index);

    if (codePoint == null) {
      break;
    }

    const character = String.fromCodePoint(codePoint);
    const characterWidth = codePointWidth(codePoint);

    if (characterWidth > 0 && visible + characterWidth > width) {
      break;
    }

    output += character;
    index += character.length;
    visible += characterWidth;
  }

  while (index < input.length) {
    const ansiMatch = input.slice(index).match(ansiPrefixPattern);

    if (!ansiMatch) {
      break;
    }

    output += ansiMatch[0];
    index += ansiMatch[0].length;
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
  let index = 0;
  let visible = 0;
  let lastSpace = -1;

  while (index < input.length && visible < width) {
    const ansiMatch = input.slice(index).match(ansiPrefixPattern);

    if (ansiMatch) {
      index += ansiMatch[0].length;
      continue;
    }

    const codePoint = input.codePointAt(index);

    if (codePoint == null) {
      break;
    }

    const character = String.fromCodePoint(codePoint);
    const characterWidth = codePointWidth(codePoint);

    if (characterWidth > 0 && visible + characterWidth > width) {
      break;
    }

    if (character === " ") {
      lastSpace = index;
    }

    index += character.length;
    visible += characterWidth;
  }

  const nextBreakIndex = indexAfterAnsiSequences(input, index);
  if (visible === width && input.codePointAt(nextBreakIndex) === 0x20) {
    return nextBreakIndex;
  }

  if (lastSpace > 0) {
    return lastSpace;
  }

  return indexAtVisibleWidth(input, width);
}

function topBorder(width: number, title: string): string {
  const contentWidth = Math.max(0, width - 2);
  const label = sliceVisible(` ${title} `, contentWidth);
  const remaining = Math.max(0, contentWidth - visibleLength(label));

  return `┌${label}${horizontal.repeat(remaining)}┐`;
}

function bottomBorder(width: number): string {
  return `└${horizontal.repeat(width - 2)}┘`;
}

function boxLine(line: string, width: number): string {
  const contentWidth = width - 4;
  const visible = sliceVisible(line, contentWidth);
  const padding = " ".repeat(Math.max(0, contentWidth - visibleLength(visible)));

  return `│ ${visible}${padding} │`;
}

function indexAtVisibleWidth(input: string, width: number): number {
  let index = 0;
  let visible = 0;

  while (index < input.length && visible < width) {
    const ansiMatch = input.slice(index).match(ansiPrefixPattern);

    if (ansiMatch) {
      index += ansiMatch[0].length;
      continue;
    }

    const codePoint = input.codePointAt(index);

    if (codePoint == null) {
      break;
    }

    const character = String.fromCodePoint(codePoint);
    const characterWidth = codePointWidth(codePoint);

    if (characterWidth > 0 && visible + characterWidth > width) {
      break;
    }

    index += character.length;
    visible += characterWidth;
  }

  return index;
}

function indexAfterAnsiSequences(input: string, startIndex: number): number {
  let index = startIndex;

  while (index < input.length) {
    const ansiMatch = input.slice(index).match(ansiPrefixPattern);

    if (!ansiMatch) {
      break;
    }

    index += ansiMatch[0].length;
  }

  return index;
}

function codePointWidth(codePoint: number): number {
  if (codePoint === 0x09) {
    return 4;
  }

  if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) {
    return 0;
  }

  if (isZeroWidthCodePoint(codePoint)) {
    return 0;
  }

  return isWideCodePoint(codePoint) ? 2 : 1;
}

function isZeroWidthCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x0483 && codePoint <= 0x0489) ||
    (codePoint >= 0x0591 && codePoint <= 0x05bd) ||
    codePoint === 0x05bf ||
    (codePoint >= 0x05c1 && codePoint <= 0x05c2) ||
    (codePoint >= 0x05c4 && codePoint <= 0x05c5) ||
    codePoint === 0x05c7 ||
    (codePoint >= 0x0610 && codePoint <= 0x061a) ||
    (codePoint >= 0x064b && codePoint <= 0x065f) ||
    codePoint === 0x0670 ||
    (codePoint >= 0x06d6 && codePoint <= 0x06dc) ||
    (codePoint >= 0x06df && codePoint <= 0x06e4) ||
    (codePoint >= 0x06e7 && codePoint <= 0x06e8) ||
    (codePoint >= 0x06ea && codePoint <= 0x06ed) ||
    codePoint === 0x0711 ||
    (codePoint >= 0x0730 && codePoint <= 0x074a) ||
    (codePoint >= 0x07a6 && codePoint <= 0x07b0) ||
    (codePoint >= 0x07eb && codePoint <= 0x07f3) ||
    (codePoint >= 0x0816 && codePoint <= 0x0819) ||
    (codePoint >= 0x081b && codePoint <= 0x0823) ||
    (codePoint >= 0x0825 && codePoint <= 0x0827) ||
    (codePoint >= 0x0829 && codePoint <= 0x082d) ||
    (codePoint >= 0x0859 && codePoint <= 0x085b) ||
    (codePoint >= 0x08d3 && codePoint <= 0x0902) ||
    codePoint === 0x093a ||
    codePoint === 0x093c ||
    (codePoint >= 0x0941 && codePoint <= 0x0948) ||
    codePoint === 0x094d ||
    (codePoint >= 0x0951 && codePoint <= 0x0957) ||
    codePoint === 0x200d ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  );
}

function isWideCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  );
}
