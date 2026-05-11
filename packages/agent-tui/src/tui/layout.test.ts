import { describe, expect, it } from "vitest";
import { clampScrollOffset, renderScreen, wrapText } from "./layout";

describe("wrapText", () => {
  it("wraps text at word boundaries", () => {
    expect(wrapText("hello from the terminal", 10)).toEqual(["hello from", "the", "terminal"]);
  });

  it("preserves blank markdown lines", () => {
    expect(wrapText("one\n\nthree", 20)).toEqual(["one", "", "three"]);
  });
});

describe("renderScreen", () => {
  it("renders boxed body and pinned input", () => {
    const output = renderScreen({
      width: 30,
      height: 8,
      title: "Chat",
      body: "# Hello\nStreaming **markdown**",
      input: "question",
      inputActive: true,
      scrollOffset: 0,
    });

    expect(output).toContain("┌ Chat ──────────────────────┐");
    expect(output).toContain("│ █ Hello                    │");
    expect(output).toContain("┌ Input ─────────────────────┐");
    expect(output).toContain("│ > question                 │");
  });

  it("scrolls up through older body lines", () => {
    const output = renderScreen({
      width: 24,
      height: 8,
      title: "Chat",
      body: "one\ntwo\nthree\nfour\nfive\nsix",
      input: "",
      inputActive: false,
      scrollOffset: 2,
    });

    expect(output).toContain("│ two                  │");
    expect(output).toContain("│ four                 │");
    expect(output).not.toContain("│ six                │");
  });
});

describe("clampScrollOffset", () => {
  it("keeps scroll offset in range", () => {
    expect(clampScrollOffset(99, "one\ntwo\nthree\nfour\nfive", 5, 24)).toBe(2);
    expect(clampScrollOffset(-1, "one\ntwo", 5, 24)).toBe(0);
  });
});
