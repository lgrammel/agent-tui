import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders common markdown blocks as terminal text", () => {
    expect(renderMarkdown("# Title\n## Section\n### Detail\n- item\n> quote")).toBe(
      "█ Title\n■ Section\n▶ Detail\n• item\n│ quote",
    );
  });

  it("removes inline markdown markers while streaming text stays readable", () => {
    expect(renderMarkdown("Use **bold**, *italic*, and `code`.")).toBe(
      "Use bold, italic, and code.",
    );
  });
});
