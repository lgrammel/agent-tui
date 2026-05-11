export type MarkdownToken =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "code"; text: string };

const ansi = {
  bold: "\x1b[1m",
  boldOff: "\x1b[22m",
  italic: "\x1b[3m",
  italicOff: "\x1b[23m",
};

export function renderMarkdown(input: string): string {
  const lines = input.split("\n");

  return lines
    .map((line) => {
      if (line.startsWith("### ")) {
        return renderInlineMarkdown(`▶ ${line.slice(4)}`);
      }

      if (line.startsWith("## ")) {
        return renderInlineMarkdown(`■ ${line.slice(3)}`);
      }

      if (line.startsWith("# ")) {
        return renderInlineMarkdown(`█ ${line.slice(2)}`);
      }

      const unorderedListItem = line.match(/^(\s*)[-+*]\s+(.*)$/);
      if (unorderedListItem) {
        const [, indentation, text = ""] = unorderedListItem;
        return renderInlineMarkdown(`${indentation}•${text.length > 0 ? ` ${text}` : ""}`);
      }

      if (/^\d+\. /.test(line)) {
        return renderInlineMarkdown(line.replace(/^(\d+)\. /, "$1. "));
      }

      if (line.startsWith("> ")) {
        return renderInlineMarkdown(`│ ${line.slice(2)}`);
      }

      return renderInlineMarkdown(line);
    })
    .join("\n");
}

function renderInlineMarkdown(input: string): string {
  return input
    .replaceAll(/`([^`]+)`/g, "$1")
    .replaceAll(/\*\*([^*\n]+)\*\*/g, `${ansi.bold}$1${ansi.boldOff}`)
    .replaceAll(/__([^_\n]+)__/g, `${ansi.bold}$1${ansi.boldOff}`)
    .replaceAll(/\*([^*\n]+)\*/g, `${ansi.italic}$1${ansi.italicOff}`)
    .replaceAll(/_([^_\n]+)_/g, `${ansi.italic}$1${ansi.italicOff}`);
}
