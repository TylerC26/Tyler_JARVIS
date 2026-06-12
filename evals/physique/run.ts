// Physique-analyzer eval runner: `npm run eval:physique` (pnpm/npx work too).
// Calls the REAL analyzePhysiquePhoto against each fixture image and diffs the
// structured output against hand-written goldens (see diff.ts for the
// per-field rules). Requires ANTHROPIC_API_KEY (loads .env.local). Fixtures
// ship with placeholder URLs — a fixture whose image can't be analyzed is
// reported as ERROR rather than crashing the run.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzePhysiquePhoto } from "@/lib/ai/physique/analyze";
import { diffAgainstGolden, type GoldenAnalysis } from "./diff";

type Fixture = { id: string; image_url: string; golden: GoldenAnalysis };

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set — eval needs a real model.");
    process.exit(2);
  }

  const file = JSON.parse(
    readFileSync(join(__dirname, "fixtures.json"), "utf8"),
  ) as { fixtures: Fixture[] };

  let passed = 0;
  let failed = 0;
  let errored = 0;
  const failures: string[] = [];

  for (const fx of file.fixtures) {
    process.stdout.write(`${DIM}▶ ${fx.id}${RESET} `);
    const result = await analyzePhysiquePhoto({ imageUrl: fx.image_url });

    if (!result.ok) {
      errored++;
      console.log(`${YELLOW}ERROR${RESET} ${DIM}${result.error}${RESET}`);
      continue;
    }

    const diff = diffAgainstGolden(result.data, fx.golden);
    if (diff.pass) {
      passed++;
      console.log(`${GREEN}PASS${RESET}`);
    } else {
      failed++;
      console.log(`${RED}FAIL${RESET}`);
      failures.push(fx.id);
    }
    for (const f of diff.fields) {
      const mark = f.pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
      console.log(`    ${mark} ${f.field.padEnd(22)} ${DIM}${f.detail}${RESET}`);
    }
  }

  const total = file.fixtures.length;
  console.log(
    `\n${passed}/${total} passed · ${failed} failed · ${errored} errored (image unavailable or API failure)`,
  );
  if (failures.length) console.log(`failing: ${failures.join(", ")}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("eval crashed:", e);
  process.exit(2);
});
