// One-shot smoke test for MiniMax-M3 vision. Sends a real image to
// MiniMax-M3 through the same provider the app uses (vercel-minimax-ai-provider,
// Anthropic-compatible) and runs both a free-text describe AND a structured
// generateObject pass — mirroring how our analyzer/extractor call-sites send
// images. Confirms the image payload reaches M3 and it returns coherent output
// before we trust MiniMax for the vision features in /llm.
//
// Run:  npx tsx scripts/smoke-minimax-vision.ts [path-or-url]
//   - no arg  → a random sample photo (plumbing check only, no text)
//   - a local image path (.jpg/.png/.webp) → base64 data URL, like the app
//   - an http(s) URL → passed through as a URL image part
//
// Needs MINIMAX_API_KEY in the environment (or .env.local).

import { readFileSync } from "node:fs";
import { extname } from "node:path";

// Lightweight .env.local loader (same as scripts/smoke-morning-brief.ts).
function loadEnv(path: string): void {
  try {
    const text = readFileSync(path, "utf-8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // ignore — we fail fast below if the key is missing
  }
}
loadEnv(".env.local");

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// Resolve the CLI arg into an AI-SDK image part value: an http URL is passed
// straight through; a local path is read and turned into a base64 data URL,
// exactly the shape our re-hosted-image call-sites send.
function resolveImage(arg: string): { value: string; how: string } {
  if (/^https?:\/\//.test(arg)) return { value: arg, how: `url ${arg}` };
  const ext = extname(arg).toLowerCase();
  const mime = MIME[ext];
  if (!mime) throw new Error(`Unsupported image extension "${ext}" for ${arg}`);
  const b64 = readFileSync(arg).toString("base64");
  return { value: `data:${mime};base64,${b64}`, how: `local file ${arg} (${mime})` };
}

async function main() {
  if (!process.env.MINIMAX_API_KEY) {
    console.error(
      "ERROR: MINIMAX_API_KEY missing — set it in .env.local (it's currently only on Vercel).",
    );
    process.exit(1);
  }

  const { minimax } = await import("vercel-minimax-ai-provider");
  const { generateText, generateObject } = await import("ai");
  const { z } = await import("zod");

  const arg = process.argv[2] ?? "https://picsum.photos/seed/minimax/512";
  const { value: image, how } = resolveImage(arg);
  console.log(`Image source: ${how}`);
  const model = minimax("MiniMax-M3");

  // 1) Free-text describe + OCR — does M3 actually receive and read the image?
  console.log("\n[1/2] generateText describe…");
  const described = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Describe this image in one sentence, then transcribe any visible text verbatim (or write NONE).",
          },
          { type: "image", image },
        ],
      },
    ],
  });
  console.log("→", described.text.trim());

  // 2) Structured output over the image — mirrors our extractor call-sites
  //    that use generateObject with a Zod schema.
  console.log("\n[2/2] generateObject structured…");
  const structured = await generateObject({
    model,
    schema: z.object({
      summary: z.string().describe("one-line description of the image"),
      visibleText: z
        .string()
        .nullable()
        .describe("verbatim text in the image, or null if none"),
      hasText: z.boolean(),
    }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this image." },
          { type: "image", image },
        ],
      },
    ],
  });
  console.log("→", JSON.stringify(structured.object, null, 2));

  // Pass check: both calls returned non-empty coherent output.
  const ok = described.text.trim().length > 0 && structured.object.summary.length > 0;
  console.log(
    ok
      ? "\nOK: MiniMax-M3 received the image and returned text + structured output."
      : "\nWARN: empty response — M3 may not have processed the image.",
  );
  process.exit(ok ? 0 : 2);
}

main().catch((e) => {
  console.error("smoke failed:", e);
  process.exit(1);
});
