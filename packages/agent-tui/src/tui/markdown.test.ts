import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders common markdown blocks as terminal text", () => {
    expect(renderMarkdown("# Title\n## Section\n### Detail\n- item\n* other\n+ extra\n> quote")).toBe(
      "█ Title\n■ Section\n▶ Detail\n• item\n• other\n• extra\n│ quote",
    );
  });

  it("renders inline markdown styles as ANSI text", () => {
    expect(renderMarkdown("Use **bold**, *italic*, and `code`.")).toBe(
      "Use \x1b[1mbold\x1b[22m, \x1b[3mitalic\x1b[23m, and code.",
    );
  });

  it("supports underscore bold and italic markers", () => {
    expect(renderMarkdown("Use __bold__ and _italic_.")).toBe(
      "Use \x1b[1mbold\x1b[22m and \x1b[3mitalic\x1b[23m.",
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
