// Hand-written types for v1 — regenerate with `supabase gen types typescript`
// once a Supabase project is connected and the migrations have been applied.

export type TaskStatus = "todo" | "done";

export type Task = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  due_at: string | null;
  completed_at: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string | null;
};

export type ProjectStatus =
  | "idea"
  | "active"
  | "paused"
  | "shipped"
  | "archived";

export type Project = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  color: string | null;
  started_at: string | null;
  target_date: string | null;
  notes: string | null;
  github_repo_url: string | null;
  github_default_branch: string | null;
  created_at: string;
  updated_at: string | null;
};

export type ProjectMilestone = {
  id: string;
  owner_id: string;
  project_id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  completed_at: string | null;
  position: number;
  created_at: string;
  updated_at: string | null;
};

export type Profile = {
  user_id: string;
  display_name: string | null;
  timezone: string;
  preferences: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
};

export type Event = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  color: string | null;
  category: string | null;
  recurrence_rule: string | null;
  source: string;
  external_id: string | null;
  task_id: string | null;
  // Populated via Supabase embed in listEventsInRangeCore. The calendar uses
  // it to strike through events whose linked task has been completed.
  linked_task?: { id: string; title: string; status: TaskStatus } | null;
  created_at: string;
  updated_at: string | null;
};

export type WifeShiftCode = "A" | "P" | "P1" | "Anight" | "NO" | "DO";

export type WifeShift = {
  owner_id: string;
  shift_date: string; // YYYY-MM-DD
  code: WifeShiftCode;
  raw_label: string | null;
  note: string | null;
  source: string;
  created_at: string;
  updated_at: string | null;
};

export type SkillSource = "manual" | "seeded" | "jarvis";

export type SkillUsageOutcome = "useful" | "neutral" | "harmful";

export type SkillUsage = {
  id: string;
  owner_id: string;
  skill_id: string;
  outcome: SkillUsageOutcome;
  critique: string | null;
  user_text: string | null;
  assistant_text: string | null;
  created_at: string;
};

export type Skill = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  instructions: string;
  trigger_keywords: string[];
  active: boolean;
  source: SkillSource;
  created_at: string;
  updated_at: string | null;
};

export type AgentModelPref = "claude" | "deepseek" | "auto";
export type AgentSource = "manual" | "seeded";

export type Agent = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  system_prompt: string;
  tool_allowlist: string[];
  model_pref: AgentModelPref;
  color: string | null;
  active: boolean;
  source: AgentSource;
  // Telegram forum topic this agent is bound to, so the owner can chat with it
  // directly in its own thread. null = not bound yet (see migration 0040).
  telegram_topic_id: number | null;
  created_at: string;
  updated_at: string | null;
};

// Soft enums on the app side — the DB stores plain text so new values need no
// migration (see migration 0038).
export type AgentRunStatus = "running" | "done" | "error";
export type AgentRunTrigger = "chat" | "telegram" | "cron" | "api";

// One row per sub-agent invocation, written by runAgent(). Powers the
// dashboard Agent Ops Board (TerminalOffice).
export type AgentRun = {
  id: string;
  owner_id: string;
  agent_slug: string;
  agent_name: string;
  agent_color: string | null;
  trigger_source: string;
  task: string | null;
  status: AgentRunStatus;
  tool_calls_count: number;
  tool_calls: string[];
  result_summary: string | null;
  started_at: string;
  ended_at: string | null;
};

// The conventional memory category set. The DB no longer constrains `kind`
// (the CHECK was dropped in migration 0033) — this tuple is the single source
// of truth and can be extended here with no migration. Ordered loosely from
// most-stable (identity) to most-situational (context).
export const MEMORY_KINDS = [
  "identity", // who Tyler is — name, location, background
  "preference", // how he likes things done
  "relationship", // people in his life
  "health", // medical facts, allergies, fitness
  "work", // job, employer, professional context
  "routine", // recurring habits and schedule
  "goal", // standing objectives he's working toward
  "knowledge", // other durable objective facts
  "context", // situational background, looser than a hard fact
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export type MemorySource = "user" | "extracted" | "agent";
export type MemoryConfidence = "high" | "medium" | "low";
// Lifecycle: 'active' is live; 'archived' is a soft-delete (recoverable);
// 'superseded' means a corrected entry replaced it (see superseded_by).
export type MemoryStatus = "active" | "archived" | "superseded";
// 'global' or 'agent:<slug>' — v1 only uses 'global'.
export type MemoryScope = string;

export type MemoryEntry = {
  id: string;
  owner_id: string;
  scope: MemoryScope;
  kind: MemoryKind;
  key: string;
  value: string;
  source: MemorySource;
  confidence: MemoryConfidence;
  pinned: boolean;
  status: MemoryStatus;
  // When status='superseded', the id of the entry that replaced this one.
  superseded_by: string | null;
  // jsonb expansion slot for structured metadata (dates, related entities).
  details: Record<string, unknown>;
  used_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string | null;
  // Omitted by read paths that don't need it (the 1536-float vector is large
  // and never rendered) — hence optional.
  embedding?: number[] | null;
};

export type PromptSettings = {
  owner_id: string;
  orchestrator_prompt: string | null;
  responder_prompt: string | null;
  prefix_addendum: string | null;
  morning_brief_prompt: string | null;
  evening_brief_prompt: string | null;
  created_at: string;
  updated_at: string | null;
};

export type ChatRole = "user" | "assistant" | "tool" | "system";

export type ChatToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ChatMessage = {
  id: string;
  owner_id: string;
  created_at: string;
  role: ChatRole;
  content: string | null;
  tool_calls: ChatToolCall[] | null;
  tool_call_id: string | null;
  tool_name: string | null;
  tool_result: Record<string, unknown> | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  // null = main Jarvis tab; otherwise scopes the row to one sub-agent thread.
  agent_slug: string | null;
  // Who authored the row, independent of `role`. null = derive from role
  // (user = owner, assistant = Jarvis); 'jarvis' = the orchestrator (e.g. a
  // delegation handoff logged onto an agent thread); '<slug>' = that sub-agent.
  sender: string | null;
};

// Dedupe ledger for the Telegram webhook — one row per processed update_id so
// Telegram retries don't double-run a turn. See lib/telegram/dedupe.ts.
export type TelegramUpdateRow = {
  update_id: number;
  created_at: string;
};

export type CronJob = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  schedule: string;
  prompt: string;
  active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RepoTaskStatus =
  | "queued"
  | "claimed"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type RepoTaskAgent = "claude-code" | "opencode";

export type RepoTask = {
  id: string;
  owner_id: string;
  status: RepoTaskStatus;
  repo_path: string;
  instruction: string;
  branch: string | null;
  base_branch: string | null;
  agent: RepoTaskAgent;
  logs: string | null;
  result: string | null;
  diff_summary: string | null;
  diff_files_changed: number | null;
  commit_sha: string | null;
  error: string | null;
  chat_message_id: string | null;
  telegram_chat_id: number | null;
  telegram_message_id: number | null;
  queued_at: string;
  claimed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  cleanup_requested_at: string | null;
  cleanup_done_at: string | null;
  cleanup_error: string | null;
};

export type SiteSettings = {
  owner_id: string;
  claude_enabled: boolean;
  created_at: string;
  updated_at: string | null;
};

export type UsageProvider = "anthropic" | "deepseek";
export type UsageSource = "chat" | "classifier" | "brief" | "suggestion";

export type UsageEvent = {
  id: string;
  owner_id: string;
  provider: UsageProvider;
  model: string;
  source: UsageSource;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  created_at: string;
};

export type Idea = {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  pinned: boolean;
  archived_at: string | null;
  promoted_to_task_id: string | null;
  promoted_to_project_id: string | null;
  created_at: string;
  updated_at: string | null;
};

export type Note = {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  created_at: string;
  updated_at: string | null;
};

// Places: spots (restaurants/cafes/bars/activities) Tyler wants to visit,
// captured from forwarded Instagram/Threads posts or added manually. The DB
// does not constrain category/source/status — these tuples are the single
// source of truth (cf. MEMORY_KINDS) and extend with no migration.
export const PLACE_CATEGORIES = [
  "restaurant",
  "cafe",
  "bar",
  "dessert",
  "activity",
  "other",
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export type PlaceSource = "instagram" | "threads" | "manual";
// want_to_go = on the wishlist; scheduled = booked onto the calendar;
// visited = already been.
export type PlaceStatus = "want_to_go" | "scheduled" | "visited";

// Grocery list: structured shopping items, populated by the Health Officer
// agent during meal-prep planning and by Tyler from chat / the /grocery web
// UI. Categories are a soft enum (no DB CHECK, cf. PLACE_CATEGORIES) — order
// here is also the rendering order on /grocery (most perishable first).
export const GROCERY_CATEGORIES = [
  "produce",
  "bakery",
  "dairy",
  "protein",
  "frozen",
  "pantry",
  "beverage",
  "household",
  "other",
] as const;
export type GroceryCategory = (typeof GROCERY_CATEGORIES)[number];

export type GrocerySource = "manual" | "health-officer" | "chat";

export type GroceryItem = {
  id: string;
  owner_id: string;
  name: string;
  quantity: string | null;
  category: GroceryCategory;
  checked: boolean;
  note: string | null;
  source: GrocerySource;
  position: number;
  created_at: string;
  checked_at: string | null;
  updated_at: string | null;
};

// Meals: structured nutrition log fed primarily by Telegram photo analysis.
// Categories are a soft enum (no DB CHECK, cf. PLACE_CATEGORIES) so we can add
// 'pre-workout', 'dessert' etc. without a migration. Items carry per-component
// macros when the model could break them out — totals on the row are
// authoritative (the model rounds and the items may not sum perfectly).
export const MEAL_TYPES = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "other",
] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export type MealSource = "telegram" | "manual" | "chat";

export type MealItem = {
  name: string;
  quantity?: string | null;
  kcal?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  fiber_g?: number | null;
};

export type Meal = {
  id: string;
  owner_id: string;
  eaten_at: string;
  meal_type: MealType | string | null;
  title: string;
  items: MealItem[];
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  notes: string | null;
  photo_url: string | null;
  source: MealSource;
  created_at: string;
  updated_at: string | null;
};

export type Place = {
  id: string;
  owner_id: string;
  name: string;
  category: PlaceCategory;
  cuisine: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  price_level: number | null;
  source: PlaceSource;
  source_url: string | null;
  image_url: string | null;
  raw_caption: string | null;
  notes: string | null;
  status: PlaceStatus;
  scheduled_event_id: string | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string | null;
};

export type AiBriefKind = "morning" | "evening";
export type AiSuggestionKind = "productivity";
export type AiSuggestionStatus = "open" | "dismissed" | "acted";
export type AiSeverity = "info" | "warn" | "crit";

export type AiBriefBullet = {
  label: string;
  value: string;
  severity: AiSeverity;
};

export type AiBrief = {
  id: string;
  owner_id: string;
  created_at: string;
  kind: AiBriefKind;
  for_date: string;
  engine: string;
  summary: string;
  bullets: AiBriefBullet[];
  context_snapshot: Record<string, unknown>;
};

export type AiSuggestion = {
  id: string;
  owner_id: string;
  created_at: string;
  kind: AiSuggestionKind;
  title: string;
  body: string;
  severity: AiSeverity;
  evidence: Record<string, unknown> | null;
  status: AiSuggestionStatus;
  brief_id: string | null;
  expires_on: string | null;
};

// Database type matching the shape `@supabase/ssr` expects.
// Insert types list only the truly required columns; everything else has a
// default or is nullable.
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          user_id: string;
          display_name?: string | null;
          timezone?: string;
          preferences?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Profile>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description?: string | null;
          status?: TaskStatus;
          priority?: number;
          due_at?: string | null;
          completed_at?: string | null;
          project_id?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Task>;
        Relationships: [];
      };
      events: {
        Row: Event;
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description?: string | null;
          starts_at: string;
          ends_at: string;
          all_day?: boolean;
          location?: string | null;
          color?: string | null;
          category?: string | null;
          recurrence_rule?: string | null;
          source?: string;
          external_id?: string | null;
          task_id?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Event>;
        Relationships: [];
      };
      wife_shifts: {
        Row: WifeShift;
        Insert: {
          owner_id: string;
          shift_date: string;
          code: WifeShiftCode;
          raw_label?: string | null;
          note?: string | null;
          source?: string;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<WifeShift>;
        Relationships: [];
      };
      skills: {
        Row: Skill;
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          description: string;
          instructions: string;
          trigger_keywords?: string[];
          active?: boolean;
          source?: SkillSource;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Skill>;
        Relationships: [];
      };
      agents: {
        Row: Agent;
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          slug: string;
          description: string;
          system_prompt: string;
          tool_allowlist?: string[];
          model_pref?: AgentModelPref;
          color?: string | null;
          active?: boolean;
          source?: AgentSource;
          telegram_topic_id?: number | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Agent>;
        Relationships: [];
      };
      agent_runs: {
        Row: AgentRun;
        Insert: {
          id?: string;
          owner_id: string;
          agent_slug: string;
          agent_name: string;
          agent_color?: string | null;
          trigger_source?: string;
          task?: string | null;
          status?: AgentRunStatus;
          tool_calls_count?: number;
          tool_calls?: string[];
          result_summary?: string | null;
          started_at?: string;
          ended_at?: string | null;
        };
        Update: Partial<AgentRun>;
        Relationships: [];
      };
      memory_entries: {
        Row: MemoryEntry;
        Insert: {
          id?: string;
          owner_id: string;
          scope?: MemoryScope;
          kind: MemoryKind;
          key: string;
          value: string;
          source: MemorySource;
          confidence?: MemoryConfidence;
          pinned?: boolean;
          status?: MemoryStatus;
          superseded_by?: string | null;
          details?: Record<string, unknown>;
          used_count?: number;
          last_used_at?: string | null;
          created_at?: string;
          updated_at?: string | null;
          embedding?: number[] | null;
        };
        Update: Partial<MemoryEntry>;
        Relationships: [];
      };
      prompt_settings: {
        Row: PromptSettings;
        Insert: {
          owner_id: string;
          orchestrator_prompt?: string | null;
          responder_prompt?: string | null;
          prefix_addendum?: string | null;
          morning_brief_prompt?: string | null;
          evening_brief_prompt?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<PromptSettings>;
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          slug: string;
          description?: string | null;
          status?: ProjectStatus;
          color?: string | null;
          started_at?: string | null;
          target_date?: string | null;
          notes?: string | null;
          github_repo_url?: string | null;
          github_default_branch?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Project>;
        Relationships: [];
      };
      project_milestones: {
        Row: ProjectMilestone;
        Insert: {
          id?: string;
          owner_id: string;
          project_id: string;
          title: string;
          description?: string | null;
          target_date?: string | null;
          completed_at?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<ProjectMilestone>;
        Relationships: [];
      };
      chat_messages: {
        Row: ChatMessage;
        Insert: {
          id?: string;
          owner_id: string;
          role: ChatRole;
          content?: string | null;
          tool_calls?: ChatToolCall[] | null;
          tool_call_id?: string | null;
          tool_name?: string | null;
          tool_result?: Record<string, unknown> | null;
          model?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          agent_slug?: string | null;
          sender?: string | null;
          created_at?: string;
        };
        Update: Partial<ChatMessage>;
        Relationships: [];
      };
      ai_briefs: {
        Row: AiBrief;
        Insert: {
          id?: string;
          owner_id: string;
          kind: AiBriefKind;
          for_date: string;
          engine?: string;
          summary: string;
          bullets?: AiBriefBullet[];
          context_snapshot: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<AiBrief>;
        Relationships: [];
      };
      ai_suggestions: {
        Row: AiSuggestion;
        Insert: {
          id?: string;
          owner_id: string;
          kind: AiSuggestionKind;
          title: string;
          body: string;
          severity?: AiSeverity;
          evidence?: Record<string, unknown> | null;
          status?: AiSuggestionStatus;
          brief_id?: string | null;
          expires_on?: string | null;
          created_at?: string;
        };
        Update: Partial<AiSuggestion>;
        Relationships: [];
      };
      telegram_updates: {
        Row: TelegramUpdateRow;
        Insert: {
          update_id: number;
          created_at?: string;
        };
        Update: Partial<TelegramUpdateRow>;
        Relationships: [];
      };
      cron_jobs: {
        Row: CronJob;
        Insert: {
          owner_id: string;
          name: string;
          description?: string | null;
          schedule: string;
          prompt: string;
          active?: boolean;
          last_run_at?: string | null;
          next_run_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<CronJob>;
        Relationships: [];
      };
      repo_tasks: {
        Row: RepoTask;
        Insert: {
          id?: string;
          owner_id: string;
          status?: RepoTaskStatus;
          repo_path: string;
          instruction: string;
          branch?: string | null;
          base_branch?: string | null;
          agent?: RepoTaskAgent;
          logs?: string | null;
          result?: string | null;
          diff_summary?: string | null;
          diff_files_changed?: number | null;
          commit_sha?: string | null;
          error?: string | null;
          chat_message_id?: string | null;
          telegram_chat_id?: number | null;
          telegram_message_id?: number | null;
          queued_at?: string;
          claimed_at?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          cleanup_requested_at?: string | null;
          cleanup_done_at?: string | null;
          cleanup_error?: string | null;
        };
        Update: Partial<RepoTask>;
        Relationships: [];
      };
      site_settings: {
        Row: SiteSettings;
        Insert: {
          owner_id: string;
          claude_enabled?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<SiteSettings>;
        Relationships: [];
      };
      usage_events: {
        Row: UsageEvent;
        Insert: {
          id?: string;
          owner_id: string;
          provider: UsageProvider;
          model: string;
          source: UsageSource;
          input_tokens?: number;
          output_tokens?: number;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          cost_usd?: number;
          created_at?: string;
        };
        Update: Partial<UsageEvent>;
        Relationships: [];
      };
      skill_usages: {
        Row: SkillUsage;
        Insert: {
          id?: string;
          owner_id: string;
          skill_id: string;
          outcome: SkillUsageOutcome;
          critique?: string | null;
          user_text?: string | null;
          assistant_text?: string | null;
          created_at?: string;
        };
        Update: Partial<SkillUsage>;
        Relationships: [];
      };
      ideas: {
        Row: Idea;
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          body?: string;
          pinned?: boolean;
          archived_at?: string | null;
          promoted_to_task_id?: string | null;
          promoted_to_project_id?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Idea>;
        Relationships: [];
      };
      notes: {
        Row: Note;
        Insert: {
          id?: string;
          owner_id: string;
          title?: string;
          body?: string;
          category?: string;
          pinned?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Note>;
        Relationships: [];
      };
      places: {
        Row: Place;
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          category?: PlaceCategory;
          cuisine?: string | null;
          city?: string | null;
          area?: string | null;
          address?: string | null;
          price_level?: number | null;
          source?: PlaceSource;
          source_url?: string | null;
          image_url?: string | null;
          raw_caption?: string | null;
          notes?: string | null;
          status?: PlaceStatus;
          scheduled_event_id?: string | null;
          scheduled_for?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Place>;
        Relationships: [];
      };
      meals: {
        Row: Meal;
        Insert: {
          id?: string;
          owner_id: string;
          eaten_at?: string;
          meal_type?: string | null;
          title: string;
          items?: MealItem[];
          kcal?: number;
          protein_g?: number;
          carbs_g?: number;
          fat_g?: number;
          fiber_g?: number | null;
          notes?: string | null;
          photo_url?: string | null;
          source?: MealSource;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Meal>;
        Relationships: [];
      };
      grocery_items: {
        Row: GroceryItem;
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          quantity?: string | null;
          category?: GroceryCategory;
          checked?: boolean;
          note?: string | null;
          source?: GrocerySource;
          position?: number;
          created_at?: string;
          checked_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<GroceryItem>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      // Semantic memory match — returns ids + cosine similarity only; the
      // caller fetches whatever columns it needs (see lib/db/core/memory.ts).
      match_memories: {
        Args: {
          query_embedding: number[];
          owner: string;
          match_count: number;
        };
        Returns: Array<{ id: string; similarity: number }>;
      };
      // Atomic used_count increment + last_used_at stamp for the given ids.
      bump_memory_usage: {
        Args: { ids: string[] };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
