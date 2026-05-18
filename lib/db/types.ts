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
  created_at: string;
  updated_at: string | null;
};

export type MemoryKind = "fact" | "preference" | "context";
export type MemorySource = "user" | "extracted" | "agent";
export type MemoryConfidence = "high" | "medium" | "low";
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
  used_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type PromptSettings = {
  owner_id: string;
  orchestrator_prompt: string | null;
  responder_prompt: string | null;
  prefix_addendum: string | null;
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

// Upstream LLM provider as identified by the OpenRouter slug prefix. Stored
// as plain text in usage_events.provider — no DB constraint, so adding new
// providers is a type-only change. "other" is the catch-all for any slug we
// don't pattern-match.
export type UsageProvider =
  | "anthropic"
  | "deepseek"
  | "openai"
  | "google"
  | "meta"
  | "mistral"
  | "xai"
  | "other";
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
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Agent>;
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
          used_count?: number;
          last_used_at?: string | null;
          created_at?: string;
          updated_at?: string | null;
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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
