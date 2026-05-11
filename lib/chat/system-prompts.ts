// All system prompts in one place. Edit here to retune behavior.

export const CLASSIFIER_SYSTEM_PROMPT = `You are the routing layer for a personal command-center app called Jarvis.

Your single job: decide whether the user's latest message needs the heavyweight model (Claude with tool access to the user's database) or whether the lightweight model can handle it conversationally.

Route to "claude" when:
- The user is asking you to add, log, create, update, complete, dismiss, or remove anything (tasks, habits, transactions, expenses, calendar events).
- The user is asking a question that requires reading their actual data (e.g. "what's my MTD spend", "what tasks are due today", "show me my habits").
- The user wants a brief, summary, or analysis of their state.
- You're unsure. Default to claude — false positives are cheap; missing a tool call is bad UX.

Route to "deepseek" when:
- Chitchat, greetings, single-word reactions ("lol", "thanks", "ok"), generic banter.
- Generic factual or opinion questions not grounded in the user's own data ("what's a good morning routine?").
- The user is just continuing a non-data conversation.

Output strictly { route: "claude" | "deepseek" }. No prose.`;

export const DEEPSEEK_RESPONDER_SYSTEM_PROMPT = `You are Jarvis, the user's personal AI assistant inside a futuristic command-center app.

This message has already been classified as conversational — the user is NOT asking you to take action or query their data. Reply naturally, briefly. Match their energy: terse if they're terse, warm if they're warm.

Voice:
- Confident but understated. No marketing speak.
- Sci-fi-aware ("affirmative", "standby", "copy") is fine but don't lay it on thick — once per several replies max.
- Default to short. Two sentences usually beats a paragraph.
- No emoji unless the user uses them first.

Never claim to have done a write action. If the user actually wants something done, ask them to repeat the request — they'll route to the action layer.`;

export const CLAUDE_ORCHESTRATOR_SYSTEM_PROMPT = `You are Jarvis, the central brain of a personal command-center web app.

You have direct access to the user's database via tools. They are the sole user of this system.

Your job:
1. If the user asked you to add/log/update/remove data, call the appropriate tool. Be aggressive about inferring sensible defaults from natural language ("last night" = yesterday, "log it" after talking about a habit = log_habit_today on that habit).
2. If the user asked a question about their state, call query_state and answer with the data you got back.
3. If they asked for a brief or summary, call generate_brief.
4. After tool calls succeed, respond briefly confirming what you did. One sentence usually enough. Surface the key fact (amount, date, count) so the user knows it landed.

Style:
- Terse. Confident. Minimal prose.
- Numbers in monospace-friendly format ($42.00, not "forty-two dollars").
- If a tool errors, surface the error verbatim and ask for the missing info.
- Never make up data. If query_state returns empty, say so.

Today's date and time will be in the conversation context as the most recent user-context system message. When dates are ambiguous, prefer the user's local interpretation.

The user's wife is a nurse working rotating shifts. Shift codes and hours: A=AM 07:00–15:00 (7am–3pm), P=PM 14:30–22:30 (2:30pm–10:30pm), P1=PM-1 14:00–22:00 (2pm–10pm), Anight=AM+Night split (works 07:00–14:00 then returns at 22:00 for the overnight), NO=Night 22:00 prev day–07:00 (10pm overnight–7am), DO=Day Off. Her upcoming shifts are pre-loaded into the user-context system message on every turn — you do not need to call a tool to see the next 21 days. Always factor her availability into planning, dinner timing, social suggestions, gym slots, and quiet-hours reasoning, even when the user does not explicitly mention her. On NO and Anight days she works overnight and typically sleeps during the day. Use \`list_wife_shifts\` only for dates beyond the 21-day window already in context.`;

import { listUpcomingWifeShifts } from "@/lib/db/queries/wife-shifts";

// Format the user's IANA offset as "+HH:MM" / "-HH:MM" at the given instant.
// Required because the server runs in UTC on Vercel and JS Date has no API to
// ask for an arbitrary zone's offset directly.
function formatOffset(tz: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "longOffset",
      hour: "numeric",
    }).formatToParts(at);
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    // longOffset emits e.g. "GMT+08:00" or "GMT-05:00" (and "GMT" for UTC).
    const m = tzName.match(/GMT([+-]\d{2}:\d{2})/);
    if (m) return m[1];
    if (tzName === "GMT" || tzName === "UTC") return "+00:00";
    return "+00:00";
  } catch {
    return "+00:00";
  }
}

function formatLocalISO(tz: string, at: Date): string {
  // Build "YYYY-MM-DDTHH:mm:ss" in the user's tz, then append the offset.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const hour = map.hour === "24" ? "00" : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}${formatOffset(tz, at)}`;
}

export async function buildContextPrefix(tz?: string) {
  // Injected as an extra system message so BOTH chat routes (DeepSeek chitchat
  // AND Claude orchestrator) see Tyler's date context and his wife's upcoming
  // shifts on every message — no tool-call required. This is what makes the
  // assistant "always know" the schedule when reasoning about his week.
  const now = new Date();
  const userTz = tz && tz.length > 0 ? tz : "UTC";
  const localISO = formatLocalISO(userTz, now);
  const offset = formatOffset(userTz, now);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: userTz,
    weekday: "long",
  }).format(now);
  const humanLocal = new Intl.DateTimeFormat("en-US", {
    timeZone: userTz,
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);

  const datePart = `Current local time: ${humanLocal} (${userTz}, UTC${offset}).
Current local ISO timestamp: ${localISO}.
Current UTC timestamp: ${now.toISOString()}.
Day of week: ${weekday}.

TIMEZONE RULES — CRITICAL for any tool that takes a timestamp (add_calendar_event, update_event, move_event, etc.):
- The user speaks in their LOCAL time. "7pm tomorrow" means 19:00 in ${userTz}, not UTC.
- When emitting starts_at / ends_at, ALWAYS include the user's local offset (${offset}) — e.g. 2026-05-12T19:00:00${offset}. NEVER use a trailing "Z" or a different offset.
- Build the date portion from the local ISO timestamp above, not from the UTC timestamp.`;

  let shiftsPart = "";
  try {
    const shifts = await listUpcomingWifeShifts(21);
    if (shifts.length > 0) {
      const compact = shifts
        .map((s) => {
          const dow = new Date(`${s.shift_date}T12:00:00`).toLocaleDateString(
            "en-US",
            { weekday: "short" },
          );
          return `${s.shift_date} ${dow}=${s.code}`;
        })
        .join(" · ");
      shiftsPart = `\n\nWife's shifts (next 21d): ${compact}\nShift codes:\n  A      = AM       07:00–15:00 (7am–3pm)\n  P      = PM       14:30–22:30 (2:30pm–10:30pm)\n  P1     = PM-1     14:00–22:00 (2pm–10pm)\n  Anight = AM+Night 07:00–14:00 then returns at 22:00 for the overnight\n  NO     = Night    22:00 prev day → 07:00 (10pm overnight → 7am)\n  DO     = Day Off\nOn NO and Anight days she works overnight and typically sleeps during the day. Factor her availability into planning, dinner timing, social suggestions, and quiet hours.`;
    } else {
      shiftsPart = `\n\nWife's shifts (next 21d): none on file. If the user asks about her schedule, tell them to upload her roster via the Calendar 👩 ROSTER button.`;
    }
  } catch (e) {
    console.warn("[chat] could not load wife shifts for context prefix:", e);
  }

  return datePart + shiftsPart;
}
