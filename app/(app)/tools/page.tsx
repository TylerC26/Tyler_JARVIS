import { ALL_TOOLS } from "@/lib/chat/tools";
import { PageHeader } from "@/components/ui/PageHeader";

type ToolMeta = {
  name: string;
  label: string;
  description: string;
  params: string[];
};

type Category = {
  label: string;
  glyph: string;
  tools: ToolMeta[];
};

const CATEGORY_MAP: Record<string, string> = {
  add_task: "Tasks",
  complete_task: "Tasks",
  delete_task: "Tasks",
  add_calendar_event: "Calendar",
  update_event: "Calendar",
  move_event: "Calendar",
  delete_event: "Calendar",
  list_events_in_range: "Calendar",
  list_wife_shifts: "Calendar",
  set_wfh_status: "Calendar",
  clear_wfh_status: "Calendar",
  list_wfh_status: "Calendar",
  add_project: "Projects",
  add_project_milestone: "Projects",
  complete_project_milestone: "Projects",
  update_project_status: "Projects",
  read_project_repo: "Projects",
  create_skill: "Skills",
  query_state: "Query",
  generate_brief: "Query",
  delegate_to_agent: "Agents",
  remember: "Memory",
  forget: "Memory",
  vision_analyze: "Vision",
  create_cron_job: "Automation",
  list_cron_jobs: "Automation",
  toggle_cron_job: "Automation",
  delete_cron_job: "Automation",
};

const CATEGORY_GLYPHS: Record<string, string> = {
  Tasks: "▤",
  Calendar: "▦",
  Projects: "⌬",
  Skills: "✦",
  Query: "◉",
  Agents: "◔",
  Memory: "◐",
  Vision: "◈",
  Automation: "⏲",
  "Web Search": "◎",
};

function formatName(name: string): string {
  return name.replace(/_/g, " ");
}

function getParams(tool: (typeof ALL_TOOLS)[keyof typeof ALL_TOOLS]): string[] {
  try {
    const schema = (tool as { inputSchema?: { shape?: Record<string, unknown> } }).inputSchema;
    if (schema?.shape) return Object.keys(schema.shape);
  } catch {}
  return [];
}

export default function ToolsPage() {
  const categoryMap = new Map<string, ToolMeta[]>();

  for (const [name, tool] of Object.entries(ALL_TOOLS)) {
    const category = CATEGORY_MAP[name] ?? "Other";
    if (!categoryMap.has(category)) categoryMap.set(category, []);
    categoryMap.get(category)!.push({
      name,
      label: formatName(name),
      description: (tool as { description?: string }).description ?? "",
      params: getParams(tool as typeof ALL_TOOLS[keyof typeof ALL_TOOLS]),
    });
  }

  // Web search is Anthropic-provided (not in ALL_TOOLS) — add manually.
  categoryMap.set("Web Search", [
    {
      name: "web_search",
      label: "web search",
      description:
        "Anthropic server-side web search. Used by Claude (Sonnet/Haiku) to look up current events, prices, weather, or any real-time information past the model's training cutoff. Billed via ANTHROPIC_API_KEY — no separate search key needed. Max 5 uses per turn.",
      params: ["query"],
    },
  ]);

  const ORDER = ["Tasks", "Calendar", "Projects", "Skills", "Query", "Agents", "Memory", "Vision", "Automation", "Web Search"];
  const categories: Category[] = ORDER.map((label) => ({
    label,
    glyph: CATEGORY_GLYPHS[label] ?? "◈",
    tools: categoryMap.get(label) ?? [],
  })).filter((c) => c.tools.length > 0);

  const total = Object.keys(ALL_TOOLS).length + 1; // +1 for web_search

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        code="TLS"
        title="Tools"
        subtitle={`${total} tools available to the orchestrator`}
      />
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8">
        {categories.map((cat) => (
          <section key={cat.label}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-accent text-base leading-none">{cat.glyph}</span>
              <h2 className="font-mono text-[11px] uppercase tracking-widest text-fg-dim">
                {cat.label}
              </h2>
              <div className="flex-1 h-px bg-edge" />
              <span className="font-mono text-[10px] text-fg-dim">{cat.tools.length}</span>
            </div>
            <div className="grid gap-2">
              {cat.tools.map((t) => (
                <div
                  key={t.name}
                  className="rounded-sm border border-edge bg-surface-2/40 px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <code className="font-mono text-[12px] text-accent shrink-0 mt-0.5">
                      {t.name}
                    </code>
                    <p className="font-mono text-[11px] text-fg-muted leading-relaxed">
                      {t.description}
                    </p>
                  </div>
                  {t.params.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-0">
                      {t.params.map((p) => (
                        <span
                          key={p}
                          className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-dim border border-edge"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
