// Hand-written types for v1 — regenerate with `supabase gen types typescript`
// once a Supabase project is connected and the migrations have been applied.

export type HabitCadence = "daily" | "weekly";

export type AccountType =
  | "checking"
  | "savings"
  | "credit"
  | "investment"
  | "cash";

export type CategoryKind = "income" | "expense";

export type TxDirection = "in" | "out";

export type ExpenseCadence = "monthly" | "weekly" | "yearly";

export type TaskStatus = "todo" | "doing" | "blocked" | "done";

export type Habit = {
  id: string;
  owner_id: string;
  name: string;
  cadence: HabitCadence;
  target_per_period: number;
  color: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type HabitLog = {
  id: string;
  owner_id: string;
  habit_id: string;
  logged_on: string;
  count: number;
  note: string | null;
  created_at: string;
};

export type Account = {
  id: string;
  owner_id: string;
  name: string;
  type: AccountType;
  currency: string;
  current_balance: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type Category = {
  id: string;
  owner_id: string;
  name: string;
  kind: CategoryKind;
  color: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string | null;
};

export type Transaction = {
  id: string;
  owner_id: string;
  account_id: string;
  occurred_on: string;
  amount: string;
  direction: TxDirection;
  category_id: string | null;
  merchant: string | null;
  note: string | null;
  source: string;
  created_at: string;
  updated_at: string | null;
};

export type FixedExpense = {
  id: string;
  owner_id: string;
  name: string;
  amount: string;
  category_id: string | null;
  cadence: ExpenseCadence;
  day_of_period: number;
  account_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
};

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
};

export type AiBriefKind = "morning" | "evening";
export type AiSuggestionKind = "productivity" | "spending" | "habit";
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
      habits: {
        Row: Habit;
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          cadence?: HabitCadence;
          target_per_period?: number;
          color?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Habit>;
        Relationships: [];
      };
      habit_logs: {
        Row: HabitLog;
        Insert: {
          id?: string;
          owner_id: string;
          habit_id: string;
          logged_on: string;
          count?: number;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<HabitLog>;
        Relationships: [];
      };
      accounts: {
        Row: Account;
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          type: AccountType;
          currency?: string;
          current_balance?: string | number;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Account>;
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          kind: CategoryKind;
          color?: string | null;
          parent_id?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Category>;
        Relationships: [];
      };
      transactions: {
        Row: Transaction;
        Insert: {
          id?: string;
          owner_id: string;
          account_id: string;
          occurred_on: string;
          amount: string | number;
          direction: TxDirection;
          category_id?: string | null;
          merchant?: string | null;
          note?: string | null;
          source?: string;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<Transaction>;
        Relationships: [];
      };
      fixed_expenses: {
        Row: FixedExpense;
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          amount: string | number;
          cadence: ExpenseCadence;
          day_of_period: number;
          category_id?: string | null;
          account_id?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: Partial<FixedExpense>;
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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

// Composite types for view layer
export type HabitWithToday = Habit & {
  logged_today: boolean;
  current_streak: number;
};

export type TransactionWithMeta = Transaction & {
  account_name: string | null;
  category_name: string | null;
  category_color: string | null;
};

export type FixedExpenseUpcoming = FixedExpense & {
  next_occurs_on: string;
  account_name: string | null;
};
