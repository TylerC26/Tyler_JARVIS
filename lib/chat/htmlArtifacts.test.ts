import { describe, expect, it } from "vitest";
import { splitHtmlSegments } from "./htmlArtifacts";

const DOC = `<!DOCTYPE html>
<html>
<head><title>Demo</title></head>
<body><h1>hi</h1></body>
</html>`;

describe("splitHtmlSegments", () => {
  it("passes plain prose through untouched", () => {
    expect(splitHtmlSegments("just a normal reply")).toEqual([
      { kind: "text", text: "just a normal reply" },
    ]);
  });

  it("extracts a fenced html block with surrounding prose", () => {
    const segs = splitHtmlSegments(
      `Here you go:\n\`\`\`html\n${DOC}\n\`\`\`\nAnything else?`,
    );
    expect(segs).toEqual([
      { kind: "text", text: "Here you go:" },
      { kind: "html", html: DOC, open: false },
      { kind: "text", text: "Anything else?" },
    ]);
  });

  it("marks a fence with no terminator as open (mid-stream)", () => {
    const segs = splitHtmlSegments("building:\n```html\n<!DOCTYPE html>\n<html>");
    expect(segs).toEqual([
      { kind: "text", text: "building:" },
      { kind: "html", html: "<!DOCTYPE html>\n<html>", open: true },
    ]);
  });

  it("extracts a bare unfenced document via doctype", () => {
    const segs = splitHtmlSegments(`Sure.\n${DOC}\nDone.`);
    expect(segs).toEqual([
      { kind: "text", text: "Sure." },
      { kind: "html", html: DOC, open: false },
      { kind: "text", text: "Done." },
    ]);
  });

  it("marks a bare document missing </html> as open", () => {
    const segs = splitHtmlSegments("<!doctype html>\n<html>\n<body>");
    expect(segs).toEqual([
      { kind: "html", html: "<!doctype html>\n<html>\n<body>", open: true },
    ]);
  });

  it("does not treat prose mentioning <html> as an artifact", () => {
    const text = "wrap it in an <html> tag and you're set";
    expect(splitHtmlSegments(text)).toEqual([{ kind: "text", text }]);
  });

  it("ignores non-html fences", () => {
    const text = "```js\nconsole.log(1)\n```";
    expect(splitHtmlSegments(text)).toEqual([{ kind: "text", text }]);
  });

  it("handles multiple html fences in one turn", () => {
    const segs = splitHtmlSegments(
      "```html\n<p>one</p>\n```\nand\n```html\n<p>two</p>\n```",
    );
    expect(segs).toEqual([
      { kind: "html", html: "<p>one</p>", open: false },
      { kind: "text", text: "and" },
      { kind: "html", html: "<p>two</p>", open: false },
    ]);
  });
});
