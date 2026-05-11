import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders common markdown blocks as terminal text", () => {
    expect(renderMarkdown("# Title\n## Section\n### Detail\n- item\n* other\n+ extra\n> quote")).toBe(
      "█ Title\n■ Section\n▶ Detail\n• item\n• other\n• extra\n│ quote",
    );
  });

  it("removes inline markdown markers while streaming text stays readable", () => {
    expect(renderMarkdown("Use **bold**, *italic*, and `code`.")).toBe(
      "Use bold, italic, and code.",
    );
  });

  it("renders a streamed unordered list marker as a bullet once the marker is complete", () => {
    expect(renderMarkdown("*")).toBe("*");
    expect(renderMarkdown("* ")).toBe("•");
    expect(renderMarkdown("* item")).toBe("• item");
  });

  it("does not treat unordered list markers on separate lines as italic text", () => {
    expect(renderMarkdown("* first\n* second")).toBe("• first\n• second");
  });
});
