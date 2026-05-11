export type MarkdownToken =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "code"; text: string };

export function renderMarkdown(input: string): string {
  const lines = input.split("\n");

  return lines
    .map((line) => {
      if (line.startsWith("### ")) {
        return `▶ ${line.slice(4)}`;
      }

      if (line.startsWith("## ")) {
        return `■ ${line.slice(3)}`;
      }

      if (line.startsWith("# ")) {
        return `█ ${line.slice(2)}`;
      }

      if (line.startsWith("- ")) {
        return `• ${line.slice(2)}`;
      }

      if (/^\d+\. /.test(line)) {
        return line.replace(/^(\d+)\. /, "$1. ");
      }

      if (line.startsWith("> ")) {
        return `│ ${line.slice(2)}`;
      }

      return line;
    })
    .join("\n")
    .replaceAll(/\*\*([^*]+)\*\*/g, "$1")
    .replaceAll(/`([^`]+)`/g, "$1")
    .replaceAll(/\*([^*]+)\*/g, "$1");
}
