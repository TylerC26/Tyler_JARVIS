import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextRunAfter } from "@/lib/db/core/cron-jobs";

// Migration 0065 reinterpreted cron_jobs.schedule from UTC to owner-local wall
// clock and rewrote the four existing rows by +8h. The ENGINE moved; the text
// the model reads did not. Two places still said UTC afterwards:
//
//   - the create_cron_job tool description and its schedule .describe()
//   - app/api/cron/generate, which contradicted itself inside one call: the
//     Zod .describe() said "convert to UTC first" while the SYSTEM prompt in
//     the same generateObject said "Do NOT convert to UTC"
//
// A model following the stale text converts local -> UTC and the job fires 8
// hours early. The engine tests can't catch that, because the engine is right;
// the failure lives entirely in prose. So assert on the prose.

const root = join(__dirname, "..", "..");

// Only what actually reaches the model matters. Comments explaining the history
// of this bug legitimately quote the old "convert to UTC first" wording, and
// asserting over them would make the fix's own documentation fail the test.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

const read = (p: string) => stripComments(readFileSync(join(root, p), "utf8"));

function cronToolBlock(): string {
  const src = read("lib/chat/tools.ts");
  const start = src.indexOf("export const createCronJobTool");
  expect(start).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf("export const", start + 10));
}

describe("cron scheduling documentation", () => {
  it("never tells the model the schedule is UTC", () => {
    for (const text of [cronToolBlock(), read("app/api/cron/generate/route.ts")]) {
      expect(text).not.toMatch(/cron expression in UTC/i);
      expect(text).not.toMatch(/UTC cron expression/i);
      expect(text).not.toMatch(/convert (any )?local time[^.]*to UTC/i);
    }
  });

  it("tells the model the schedule is local, in both cron surfaces", () => {
    expect(cronToolBlock()).toMatch(/LOCAL/);
    expect(read("app/api/cron/generate/route.ts")).toMatch(/LOCAL/);
  });

  it("does not contradict itself inside the generate route", () => {
    const src = read("app/api/cron/generate/route.ts");
    // The schema description and the system prompt are handed to the SAME
    // generateObject call, so they must not disagree.
    const schemaDesc = src.slice(src.indexOf("const DraftSchema"), src.indexOf("const SYSTEM"));
    const system = src.slice(src.indexOf("const SYSTEM"), src.indexOf("type Body"));
    const saysConvert = (t: string) => /convert[^.]*to UTC(?!\s*—)/i.test(t);
    expect(saysConvert(schemaDesc)).toBe(false);
    expect(saysConvert(system)).toBe(false);
  });

  it("the example the tool documents means what the engine does", () => {
    // "0 8 * * *" is advertised as 8am daily in the owner's timezone. Default
    // OWNER_TZ is Asia/Hong_Kong (UTC+8, no DST), so that is 00:00Z.
    expect(cronToolBlock()).toContain("'0 8 * * *'");
    const from = new Date("2026-07-17T00:00:00+08:00");
    const next = nextRunAfter("0 8 * * *", from);
    expect(next).not.toBeNull();
    // Formatted in the owner's zone it must read 08:00 — the assertion the
    // stale docs would have broken.
    const hk = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Hong_Kong",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(next!);
    expect(hk).toBe("08:00");
  });
});
