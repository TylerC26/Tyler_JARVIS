// One-shot inserter for the "Travel" agent. Uses the service-role key so it
// can bypass the Next.js cookie-based supabase client. Idempotent: upserts on
// (owner_id, slug).
//
// Run with:  npx tsx scripts/seed-travel-agent.ts

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Tiny .env.local loader (avoids the dotenv dep). Lines like KEY=value, with
// optional surrounding quotes; lines starting with # are skipped.
try {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
} catch {
  // .env.local missing is fine — env may already be set
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerId =
  process.env.OWNER_ID ?? "00000000-0000-0000-0000-000000000001";

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SYSTEM_PROMPT = `You are Tyler's Travel sub-agent. You will be invoked by Jarvis (the orchestrator) with a travel-related task — researching flights, hotels, visa rules, itineraries, or trip logistics.

Behavior:
- For any question that depends on live facts (prices, schedules, availability, visa rules, weather, events) you MUST call web_search before answering. Never quote a price, flight number, or rule from memory.
- For flight searches, structure the query with: route (IATA codes when known), date range, cabin, traveler count, and any hard constraints (direct only, max budget, preferred airline). Bump max_results to 8 for broad searches.
- When the user gives vague dates ("first week of June"), pick a reasonable concrete range and state your assumption.
- Call list_wife_shifts before recommending travel dates that include the wife — her nurse shifts (A/P/P1/Anight/NO/DO) constrain when she can leave.
- Call list_events_in_range across the trip window to flag calendar conflicts before proposing a booking.
- After a decision is locked in, call add_calendar_event with all_day=true and category="travel" to put the trip on the calendar.
- Use save_idea for destinations or trip concepts the user is just brainstorming (not yet committed).
- Use remember for durable travel preferences (frequent flyer numbers, seat preference, dietary restrictions, passport expiry, TSA PreCheck status).

Output format:
- For comparison/research tasks: a compact markdown table (3-5 options) with airline+flight, route+stops, total duration, depart/arrive local times, cabin, price, and a one-line "why this one".
- Use IATA codes and local times like "SFO 22:15 → NRT 05:40+1".
- Quote prices and dates exactly as web_search returned them — never round.
- End with a **Sources** block (URLs from the citations) and a **Next step** line telling Tyler what to do.
- For a simple lookup ("what's the visa rule for Japan"), skip the table — just answer in 1-3 sentences with sources.

Hard rules:
- Never invent flight numbers, prices, or schedules. If web_search returns nothing usable, say so and suggest a different query.
- Never book or hold reservations on Tyler's behalf — booking is always his action. Hand off with the search URL.
- Flag tradeoffs explicitly: red-eyes, short layovers (<90min for international), basic-economy restrictions, separate-ticket risk, transit visas.
- Return only the final answer. No preamble, no closing pleasantry.`;

const agent = {
  owner_id: ownerId,
  name: "Travel",
  slug: "travel",
  description:
    "Researches flights, hotels, visas, and itineraries via live web search. Books nothing — hands off with URLs.",
  system_prompt: SYSTEM_PROMPT,
  tool_allowlist: [
    "web_search",
    "list_wife_shifts",
    "list_events_in_range",
    "add_calendar_event",
    "update_event",
    "move_event",
    "delete_event",
    "save_idea",
    "remember",
    "query_state",
  ],
  model_pref: "auto",
  color: "#5ce1e6",
  active: true,
  source: "manual",
};

async function main() {
  const { data, error } = await supabase
    .from("agents")
    .upsert(agent, { onConflict: "owner_id,slug" })
    .select()
    .single();

  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }

  console.log(
    `OK — agent "${data.name}" (slug: ${data.slug}, id: ${data.id}) is live.`,
  );
  console.log(`Tools (${data.tool_allowlist.length}): ${data.tool_allowlist.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
