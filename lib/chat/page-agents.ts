// Client-safe page→chat mapping (no server imports — the ChatLauncher bundles
// this). Two concerns live here:
//   1. Which sub-agent should field messages typed into the docked chatbox on
//      a given page (null = main Jarvis orchestrator).
//   2. A short human label for the context strip above the chatbox.
// The server-side counterpart (lib/chat/page-context.ts) builds the full
// system-prompt block for the same paths.

// Ordered first-match-wins rules. A trailing (\/|$) means the list page AND
// its detail pages share the agent. Project detail pages are category-aware
// and refine this via <PageAgentHint/> (lib/chat/page-agent-hint.ts): WORK
// projects → Claudia, ventures → Developer; the /projects entry below covers
// the list page and the first paint of a detail page before its hint lands.
const PAGE_AGENT_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/projects(\/|$)/, "work-assistant"], // Claudia — work projects
  [/^\/ventures$/, "developer"], // side-business list (category "other")
  [/^\/repo-tasks(\/|$)/, "developer"],
  [/^\/meetings(\/|$)/, "work-assistant"], // Claudia — meeting notes live with her
  [/^\/calendar$/, "scheduler"],
  [/^\/tasks$/, "planner"],
  [/^\/places$/, "travel"],
];

// The sub-agent slug that should handle chat turns typed on this page, or
// null for main Jarvis. The launcher only honors it when the slug exists in
// the active roster, so a deleted/disabled agent degrades to Jarvis.
export function defaultAgentSlugForPath(path: string): string | null {
  for (const [re, slug] of PAGE_AGENT_RULES) {
    if (re.test(path)) return slug;
  }
  return null;
}

const STATIC_PAGE_LABELS: Record<string, string> = {
  "/": "dashboard",
  "/assistant": "assistant brief",
  "/agents": "agents",
  "/calendar": "calendar",
  "/cron": "cron jobs",
  "/grocery": "grocery list",
  "/ideas": "ideas",
  "/kcal": "kcal tracker",
  "/meetings": "meetings",
  "/memory": "memory",
  "/notes": "notes",
  "/places": "places",
  "/projects": "projects",
  "/repo-tasks": "repo tasks",
  "/settings": "settings",
  "/skills": "skills",
  "/tasks": "tasks",
  "/tools": "tools",
  "/ventures": "ventures",
};

// Short label for the launcher's context strip ("◈ ctx · kix11 project").
// Null = no page context (unknown route, or the chat surfaces themselves).
export function pageContextLabel(path: string): string | null {
  const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
  const staticLabel = STATIC_PAGE_LABELS[clean];
  if (staticLabel) return staticLabel;

  const seg = clean.split("/").filter(Boolean);
  if (seg[0] === "projects" && seg[1]) {
    return `${decodeURIComponent(seg[1])} project`;
  }
  if (seg[0] === "meetings" && seg[1]) return "meeting detail";
  if (seg[0] === "repo-tasks" && seg[1]) return "repo task";
  return null;
}
