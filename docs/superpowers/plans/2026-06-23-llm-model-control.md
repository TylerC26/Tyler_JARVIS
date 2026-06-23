# LLM Model Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/llm` page under the SYSTEM nav where every LLM call-site in JARVIS can be pinned to a specific model (or left on AUTO), persisted in Supabase and honored at runtime by chat, cron, agents, and background tasks.

**Architecture:** A DB-backed override table (`model_prefs`) read by a small resolver (`lib/ai/model-prefs.ts`). Each call-site keeps its current model as the default; an override only changes what's explicitly set. The chat path threads the `chat` pref through the existing `forceRoute` mechanism; background call-sites swap their `llmAuto()/llmFast()/llmOpus()`/direct-`anthropic()` calls for `modelForFeature("<key>")`; agents and cron jobs get inline per-record model selection.

**Tech Stack:** Next.js 16 App Router (server components + server actions), React 19, Tailwind v4 (custom terminal theme), Supabase Postgres, Vercel AI SDK v6 (`@ai-sdk/anthropic`, `@ai-sdk/deepseek`), Vitest.

## Global Constraints

- Models are the four already wired: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`, `deepseek-chat`. No new model IDs.
- `model_pref` vocabulary everywhere: `auto | opus | sonnet | haiku | deepseek`. `auto` = use the coded default.
- DeepSeek is hidden / disallowed for vision-required features (it isn't vision-capable).
- Background call-sites today do NOT consult the Claude kill switch; preserve that — only the chat and agent paths honor `isClaudeEnabled()`.
- Route is lowercase `/llm`; nav code `LLM`, glyph `◈`, added to the existing `system` section.
- Follow existing patterns: `lib/db/core/<entity>.ts` with `getSupabaseServer()` + `getOwnerId()`; server actions in `app/(app)/<route>/actions.ts` with `"use server"` + `revalidatePath`; client view in `components/modules/<route>/`.
- Theme classes: `text-fg`, `text-fg-muted`, `text-fg-dim`, `text-accent`, `text-success`, `text-danger`; `bg-surface`, `bg-surface-2`, `border-edge`, `border-edge-strong`; `font-mono`. UI primitives: `PageHeader`, `Button`, `StatusBadge`, `Field`/`Input`/`Select`/`Textarea`.
- Migration is `supabase/migrations/0055_model_prefs.sql` (next in sequence after `0054`).
- Tests run with `npm run test` (vitest). Typecheck with `npx tsc --noEmit`. Full build with `npm run build`.

## File Structure

**Create:**
- `supabase/migrations/0055_model_prefs.sql` — `model_prefs` table + `cron_jobs.model_pref` column.
- `lib/db/core/model-prefs.ts` — DB read/write for overrides.
- `lib/ai/model-prefs.ts` — feature registry + resolver (the core unit).
- `lib/ai/model-prefs.test.ts` — unit tests for pure resolver logic.
- `lib/ai/agents/pick-model.test.ts` — unit tests for the agent model mapper.
- `app/(app)/llm/page.tsx` — server component, loads data.
- `app/(app)/llm/actions.ts` — server actions.
- `components/modules/llm/LlmControlView.tsx` — client UI (all sections).

**Modify:**
- `lib/db/types.ts` — add `ModelPref`, `FeatureKey`; broaden `AgentModelPref`; add `model_pref` to `CronJob`.
- `lib/db/core/cron-jobs.ts` — include `model_pref` in create/update.
- `lib/db/core/usage.ts` — `getModelUsageTodayCore()` for the spend strip.
- `lib/ai/agents/run.ts` — extract `agentModelId()` pure mapper; broaden `pickModel`.
- `lib/chat/turn.ts` — global pin fallback in `runChatTurn`.
- `app/api/chat/route.ts` — global pin fallback in the web route.
- `app/api/cron/route.ts` — per-job model pin.
- Background call-sites (12 files) — swap to `modelForFeature()`.
- `lib/nav/order.ts` — add the `/llm` nav item.

---

### Task 1: Migration, types, and cron model column

**Files:**
- Create: `supabase/migrations/0055_model_prefs.sql`
- Modify: `lib/db/types.ts` (near `AgentModelPref` line 238, `CronJob` line 395)
- Modify: `lib/db/core/cron-jobs.ts:6-17` (`CreateCronJobInput`, `UpdateCronJobInput`)

**Interfaces:**
- Produces: `ModelPref` type, broadened `AgentModelPref`, `CronJob.model_pref`, `model_prefs` table, `cron_jobs.model_pref` column.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0055_model_prefs.sql`:

```sql
-- Per-call-site LLM model overrides. One row per (owner, feature_key) the user
-- has pinned; an absent row means 'auto' (use the call-site's coded default).
-- Sibling of site_settings/prompt_settings — runtime model selection rather
-- than kill switches or prompt text.

create table if not exists public.model_prefs (
  owner_id    text not null,
  feature_key text not null,
  model_pref  text not null default 'auto',
  updated_at  timestamptz,
  primary key (owner_id, feature_key)
);

-- RLS — same shape as every other table (see migration 0050). The server uses
-- the service-role key and bypasses this; the anon key stays locked out.
alter table public.model_prefs enable row level security;
drop policy if exists model_prefs_owner_all on public.model_prefs;
create policy model_prefs_owner_all on public.model_prefs
  for all to public
  using (owner_id::text = (auth.uid())::text)
  with check (owner_id::text = (auth.uid())::text);

-- Per-cron-job model pin. 'auto' keeps the classifier/global-pin behavior.
alter table public.cron_jobs
  add column if not exists model_pref text not null default 'auto';
```

- [ ] **Step 2: Apply the migration**

Run: `ls supabase/migrations/0055_model_prefs.sql` to confirm it exists. Apply via the project's normal migration path (Supabase SQL editor or `supabase db push` if wired). Note in the commit if it must be applied manually.

- [ ] **Step 3: Add/broaden types in `lib/db/types.ts`**

Replace the `AgentModelPref` definition (line 238):

```typescript
// Legacy "claude" is kept as an alias for opus so existing agent rows keep
// working; the /llm + agents UIs offer the explicit tiers.
export type AgentModelPref =
  | "auto"
  | "claude"
  | "opus"
  | "sonnet"
  | "haiku"
  | "deepseek";

// Per-call-site model override. 'auto' = use the call-site's coded default.
export type ModelPref = "auto" | "opus" | "sonnet" | "haiku" | "deepseek";
```

In the `CronJob` type (line 395), add the field (next to `prompt`/`active`):

```typescript
  model_pref: ModelPref;
```

- [ ] **Step 4: Thread `model_pref` through cron-jobs core**

In `lib/db/core/cron-jobs.ts`, add to `CreateCronJobInput` (after `prompt`):

```typescript
  model_pref?: ModelPref;
```

Add `ModelPref` to the type import at the top:

```typescript
import type { CronJob, ModelPref } from "@/lib/db/types";
```

Extend `UpdateCronJobInput` to include `model_pref`:

```typescript
export type UpdateCronJobInput = Partial<
  Pick<CronJob, "name" | "description" | "schedule" | "prompt" | "active" | "model_pref">
>;
```

In `createCronJobCore`, default it when inserting (find the insert object and add):

```typescript
    model_pref: input.model_pref ?? "auto",
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors from the type changes).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0055_model_prefs.sql lib/db/types.ts lib/db/core/cron-jobs.ts
git commit -m "feat(llm): model_prefs table + cron model_pref column + types"
```

---

### Task 2: Override DB core

**Files:**
- Create: `lib/db/core/model-prefs.ts`

**Interfaces:**
- Consumes: `getSupabaseServer` (`@/lib/supabase/server`), `getOwnerId` (`@/lib/auth/currentUser`), `ModelPref` (`@/lib/db/types`).
- Produces: `getModelPrefsCore(): Promise<Record<string, ModelPref>>`, `setModelPrefCore(featureKey: string, modelPref: ModelPref): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the core module**

Create `lib/db/core/model-prefs.ts` (mirrors `site-settings.ts`):

```typescript
// Per-call-site LLM model overrides. Sibling of site-settings.ts: one row per
// (owner, feature_key). Absent feature_key = 'auto' (the call-site's default).

import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { ModelPref } from "@/lib/db/types";

export async function getModelPrefsCore(): Promise<Record<string, ModelPref>> {
  const supabase = await getSupabaseServer();
  if (!supabase) return {};
  const { data } = await supabase
    .from("model_prefs")
    .select("feature_key, model_pref")
    .eq("owner_id", getOwnerId());
  const out: Record<string, ModelPref> = {};
  for (const row of (data as { feature_key: string; model_pref: ModelPref }[] | null) ?? []) {
    out[row.feature_key] = row.model_pref;
  }
  return out;
}

export async function setModelPrefCore(
  featureKey: string,
  modelPref: ModelPref,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase.from("model_prefs").upsert(
    {
      owner_id: getOwnerId(),
      feature_key: featureKey,
      model_pref: modelPref,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,feature_key" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/db/core/model-prefs.ts
git commit -m "feat(llm): model_prefs DB core (get/set)"
```

---

### Task 3: Feature registry + resolver (TDD core)

**Files:**
- Create: `lib/ai/model-prefs.ts`
- Test: `lib/ai/model-prefs.test.ts`

**Interfaces:**
- Consumes: `getModelPrefsCore` (`@/lib/db/core/model-prefs`), `ForceRoute` (`@/lib/chat/router`), `anthropic`, `deepseek`, `LanguageModel` (`ai`).
- Produces:
  - `type FeatureKey` (union), `type Tier = "opus" | "sonnet" | "haiku"`, `type ConcreteModelId`, `type FeatureGroup`, `type FeatureDef`.
  - `FEATURES: FeatureDef[]`, `FEATURE_MAP: Record<FeatureKey, FeatureDef>`.
  - pure `resolveModelId(pref, defaultTier, visionRequired): ConcreteModelId`.
  - pure `forceRouteForPref(pref: ModelPref): ForceRoute | undefined`.
  - async `modelForFeature(key): Promise<{ model: LanguageModel; modelId: ConcreteModelId }>`.
  - async `chatForceRoute(): Promise<ForceRoute | undefined>`.
  - `invalidateModelPrefsCache(): void`.

- [ ] **Step 1: Write the failing test**

Create `lib/ai/model-prefs.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { resolveModelId, forceRouteForPref } from "./model-prefs";

describe("resolveModelId", () => {
  it("auto uses the coded default tier", () => {
    expect(resolveModelId("auto", "sonnet", false)).toBe("claude-sonnet-4-6");
    expect(resolveModelId("auto", "haiku", false)).toBe("claude-haiku-4-5");
    expect(resolveModelId("auto", "opus", false)).toBe("claude-opus-4-7");
  });

  it("an explicit pref overrides the default", () => {
    expect(resolveModelId("haiku", "opus", false)).toBe("claude-haiku-4-5");
    expect(resolveModelId("deepseek", "sonnet", false)).toBe("deepseek-chat");
  });

  it("drops a deepseek pref back to default for vision features", () => {
    expect(resolveModelId("deepseek", "sonnet", true)).toBe("claude-sonnet-4-6");
  });
});

describe("forceRouteForPref", () => {
  it("auto yields undefined so the classifier runs", () => {
    expect(forceRouteForPref("auto")).toBeUndefined();
  });
  it("an explicit pref maps straight to a ForceRoute", () => {
    expect(forceRouteForPref("opus")).toBe("opus");
    expect(forceRouteForPref("deepseek")).toBe("deepseek");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- model-prefs`
Expected: FAIL ("Cannot find module './model-prefs'" / exports undefined).

- [ ] **Step 3: Write the resolver module**

Create `lib/ai/model-prefs.ts`:

```typescript
// Feature registry + resolver for per-call-site model overrides. The registry
// is the single source of truth for "every place JARVIS calls an LLM"; the
// resolver turns a stored ModelPref into a concrete AI-SDK model, honoring the
// per-feature default tier and the vision constraint. Pure decision logic is
// split out (resolveModelId / forceRouteForPref) so it's unit-testable without
// touching Supabase or the providers.

import { anthropic } from "@ai-sdk/anthropic";
import { deepseek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";
import { getModelPrefsCore } from "@/lib/db/core/model-prefs";
import type { ForceRoute } from "@/lib/chat/router";
import type { ModelPref } from "@/lib/db/types";

export type FeatureKey =
  | "chat"
  | "memory"
  | "skill_judge"
  | "skill_propose"
  | "skill_generate"
  | "brief"
  | "suggestion"
  | "cron_generate"
  | "meal_analysis"
  | "physique_analysis"
  | "place_extraction"
  | "calendar_extract"
  | "wife_shifts_extract"
  | "meeting_finalize"
  | "agent_draft";

export type Tier = "opus" | "sonnet" | "haiku";
export type ConcreteModelId =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "deepseek-chat";

export type FeatureGroup =
  | "Routing"
  | "Memory"
  | "Skills"
  | "Briefs & Suggestions"
  | "Analyzers"
  | "Extractors"
  | "Agents";

export type FeatureDef = {
  key: FeatureKey;
  label: string;
  description: string;
  group: FeatureGroup;
  defaultTier: Tier;
  visionRequired: boolean;
  // chat is resolved through the route classifier (forceRoute), not
  // modelForFeature; it's listed here so the UI can render it as the hero.
  routed: boolean;
};

export const FEATURES: FeatureDef[] = [
  { key: "chat", label: "Main JARVIS", description: "Orchestrator for web chat, Telegram, Discord, and cron turns. AUTO runs the classifier (haiku/sonnet/opus).", group: "Routing", defaultTier: "sonnet", visionRequired: false, routed: true },
  { key: "memory", label: "Memory reconciliation", description: "Post-turn pass that dedupes and updates long-term memory.", group: "Memory", defaultTier: "haiku", visionRequired: false, routed: false },
  { key: "skill_judge", label: "Skill judge", description: "Scores how well a reply followed a matched skill.", group: "Skills", defaultTier: "sonnet", visionRequired: false, routed: false },
  { key: "skill_propose", label: "Skill proposer", description: "Drafts new skills from successful tool trajectories.", group: "Skills", defaultTier: "sonnet", visionRequired: false, routed: false },
  { key: "skill_generate", label: "Skill generator", description: "Generates a skill from a short description in the Skills UI.", group: "Skills", defaultTier: "sonnet", visionRequired: false, routed: false },
  { key: "brief", label: "Briefs", description: "Morning/evening briefs and the in-chat generate-brief tool.", group: "Briefs & Suggestions", defaultTier: "opus", visionRequired: false, routed: false },
  { key: "suggestion", label: "Suggestions", description: "Proactive dashboard suggestions.", group: "Briefs & Suggestions", defaultTier: "opus", visionRequired: false, routed: false },
  { key: "cron_generate", label: "Cron generator", description: "Turns a natural-language description into a cron job.", group: "Briefs & Suggestions", defaultTier: "opus", visionRequired: false, routed: false },
  { key: "meal_analysis", label: "Meal analysis", description: "Reads a meal photo into calories/macros.", group: "Analyzers", defaultTier: "sonnet", visionRequired: true, routed: false },
  { key: "physique_analysis", label: "Physique analysis", description: "Analyzes/compares progress photos.", group: "Analyzers", defaultTier: "sonnet", visionRequired: true, routed: false },
  { key: "place_extraction", label: "Place extraction", description: "Extracts place details from a screenshot or text.", group: "Extractors", defaultTier: "sonnet", visionRequired: true, routed: false },
  { key: "calendar_extract", label: "Calendar extraction", description: "Extracts events from a pasted/screenshotted schedule.", group: "Extractors", defaultTier: "sonnet", visionRequired: true, routed: false },
  { key: "wife_shifts_extract", label: "Wife-shifts extraction", description: "Extracts shift times from a roster image.", group: "Extractors", defaultTier: "sonnet", visionRequired: true, routed: false },
  { key: "meeting_finalize", label: "Meeting finalize", description: "Summarizes a meeting transcript into notes + actions.", group: "Extractors", defaultTier: "sonnet", visionRequired: false, routed: false },
  { key: "agent_draft", label: "Agent drafting", description: "Drafts a sub-agent's spec from a description.", group: "Agents", defaultTier: "sonnet", visionRequired: false, routed: false },
];

export const FEATURE_MAP: Record<FeatureKey, FeatureDef> = Object.fromEntries(
  FEATURES.map((f) => [f.key, f]),
) as Record<FeatureKey, FeatureDef>;

const MODEL_ID: Record<"opus" | "sonnet" | "haiku" | "deepseek", ConcreteModelId> = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5",
  deepseek: "deepseek-chat",
};

// Pure: stored pref + the call-site's default tier + vision flag -> model id.
export function resolveModelId(
  pref: ModelPref,
  defaultTier: Tier,
  visionRequired: boolean,
): ConcreteModelId {
  let tier: "opus" | "sonnet" | "haiku" | "deepseek" =
    pref === "auto" ? defaultTier : pref;
  // deepseek-chat can't see images — vision features fall back to the default.
  if (tier === "deepseek" && visionRequired) tier = defaultTier;
  return MODEL_ID[tier];
}

// Pure: map the chat pref to a forceRoute. auto -> undefined (classifier runs);
// every other value is already a valid ForceRoute.
export function forceRouteForPref(pref: ModelPref): ForceRoute | undefined {
  return pref === "auto" ? undefined : pref;
}

// ---- cached prefs read (chat is a hot path) ----
let cache: { at: number; map: Record<string, ModelPref> } | null = null;
const TTL_MS = 60_000;

async function getModelPrefsCached(): Promise<Record<string, ModelPref>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  try {
    const map = await getModelPrefsCore();
    cache = { at: Date.now(), map };
    return map;
  } catch (e) {
    console.warn("[model-prefs] read failed, using defaults:", e);
    return cache?.map ?? {};
  }
}

export function invalidateModelPrefsCache(): void {
  cache = null;
}

// Resolve a concrete AI-SDK model + its id for a non-chat call-site.
export async function modelForFeature(
  key: Exclude<FeatureKey, "chat">,
): Promise<{ model: LanguageModel; modelId: ConcreteModelId }> {
  const def = FEATURE_MAP[key];
  const prefs = await getModelPrefsCached();
  const pref = prefs[key] ?? "auto";
  const modelId = resolveModelId(pref, def.defaultTier, def.visionRequired);
  const model =
    modelId === "deepseek-chat" ? deepseek("deepseek-chat") : anthropic(modelId);
  return { model, modelId };
}

// The chat call-site is route-classified, not model-resolved: surface its pref
// as a forceRoute the turn entrypoints feed into decideRoute.
export async function chatForceRoute(): Promise<ForceRoute | undefined> {
  const prefs = await getModelPrefsCached();
  return forceRouteForPref(prefs.chat ?? "auto");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- model-prefs`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/model-prefs.ts lib/ai/model-prefs.test.ts
git commit -m "feat(llm): feature registry + model resolver with unit tests"
```

---

### Task 4: Wire the global JARVIS pin into chat

**Files:**
- Modify: `lib/chat/turn.ts:211` (inside `runChatTurnInner`)
- Modify: `app/api/chat/route.ts:265-268` (main thread `decideRoute` call)

**Interfaces:**
- Consumes: `chatForceRoute` (`@/lib/ai/model-prefs`).
- Produces: a pinned `chat` pref now drives cron/Telegram (`runChatTurn`) and web chat; per-request `forceRoute` still wins.

- [ ] **Step 1: Add the fallback in `runChatTurn`**

In `lib/chat/turn.ts`, add the import near the other `@/lib/ai` imports:

```typescript
import { chatForceRoute } from "@/lib/ai/model-prefs";
```

Replace line 211:

```typescript
  const route = await decideRoute(modelMessages, { forceRoute });
```

with:

```typescript
  const route = await decideRoute(modelMessages, {
    forceRoute: forceRoute ?? (await chatForceRoute()),
  });
```

- [ ] **Step 2: Add the fallback in the web route**

In `app/api/chat/route.ts`, add the import:

```typescript
import { chatForceRoute } from "@/lib/ai/model-prefs";
```

Replace the main-thread route decision (lines 265-268):

```typescript
  const route = await decideRoute(modelMessages, {
    forceRoute,
    pageLabel: pageContext?.label ?? null,
  });
```

with:

```typescript
  const route = await decideRoute(modelMessages, {
    forceRoute: forceRoute ?? (await chatForceRoute()),
    pageLabel: pageContext?.label ?? null,
  });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/chat/turn.ts app/api/chat/route.ts
git commit -m "feat(llm): chat honors the global JARVIS model pin"
```

---

### Task 5: Wire agent model selection (TDD)

**Files:**
- Modify: `lib/ai/agents/run.ts:53-73` (`pickModel`)
- Test: `lib/ai/agents/pick-model.test.ts`

**Interfaces:**
- Produces: pure `agentModelId(pref: AgentModelPref, claudeReady: boolean, deepseekReady: boolean): ChatModelId | null`; `pickModel` reuses it and now supports `opus/sonnet/haiku/deepseek` + legacy `claude`.

- [ ] **Step 1: Write the failing test**

Create `lib/ai/agents/pick-model.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { agentModelId } from "./run";

describe("agentModelId", () => {
  it("legacy 'claude' maps to opus", () => {
    expect(agentModelId("claude", true, true)).toBe("claude-opus-4-7");
  });
  it("'auto' maps to sonnet when Claude is ready", () => {
    expect(agentModelId("auto", true, true)).toBe("claude-sonnet-4-6");
  });
  it("explicit tiers map straight through", () => {
    expect(agentModelId("haiku", true, false)).toBe("claude-haiku-4-5");
    expect(agentModelId("opus", true, false)).toBe("claude-opus-4-7");
  });
  it("deepseek pref falls back to opus when deepseek is unavailable", () => {
    expect(agentModelId("deepseek", true, false)).toBe("claude-opus-4-7");
  });
  it("falls back to deepseek when Claude is not ready", () => {
    expect(agentModelId("sonnet", false, true)).toBe("deepseek-chat");
  });
  it("returns null when no provider is available", () => {
    expect(agentModelId("auto", false, false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- pick-model`
Expected: FAIL (`agentModelId` is not exported).

- [ ] **Step 3: Add `agentModelId` and refactor `pickModel`**

In `lib/ai/agents/run.ts`, add the import for the type and the pure mapper above `pickModel`:

```typescript
import type { Agent, AgentModelPref, ChatToolCall } from "@/lib/db/types";
```

(adjust the existing `import type { Agent, ChatToolCall } from "@/lib/db/types";` to include `AgentModelPref`.)

Add the pure mapper:

```typescript
// Pure: agent pref + provider readiness -> concrete model id (or null when no
// provider is configured). Legacy 'claude' = opus; 'auto' = sonnet. Split out
// of pickModel so the branch table is unit-testable.
export function agentModelId(
  pref: AgentModelPref,
  claudeReady: boolean,
  deepseekReady: boolean,
): ChatModelId | null {
  let want: "opus" | "sonnet" | "haiku" | "deepseek";
  switch (pref) {
    case "deepseek":
      want = "deepseek";
      break;
    case "opus":
    case "claude":
      want = "opus";
      break;
    case "haiku":
      want = "haiku";
      break;
    case "sonnet":
      want = "sonnet";
      break;
    default: // "auto"
      want = "sonnet";
  }
  if (want === "deepseek") {
    if (deepseekReady) return "deepseek-chat";
    if (claudeReady) return "claude-opus-4-7";
    return null;
  }
  if (claudeReady) {
    return want === "opus"
      ? "claude-opus-4-7"
      : want === "haiku"
        ? "claude-haiku-4-5"
        : "claude-sonnet-4-6";
  }
  if (deepseekReady) return "deepseek-chat";
  return null;
}
```

Replace the body of `pickModel` (lines 53-73) with:

```typescript
async function pickModel(agent: Agent): Promise<PickedModel | null> {
  const claudeReady = (await isClaudeEnabled()) && isAnthropicConfigured();
  const deepseekReady = isDeepseekConfigured();
  const id = agentModelId(agent.model_pref, claudeReady, deepseekReady);
  if (!id) return null;
  const model = id === "deepseek-chat" ? deepseek("deepseek-chat") : anthropic(id);
  return { model, modelId: id };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- pick-model`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/agents/run.ts lib/ai/agents/pick-model.test.ts
git commit -m "feat(llm): agents support full model tiers via agentModelId"
```

---

### Task 6: Wire per-job cron model pin

**Files:**
- Modify: `app/api/cron/route.ts:70-91` (`runJob`)

**Interfaces:**
- Consumes: `forceRouteForPref` (`@/lib/ai/model-prefs`).
- Produces: a cron job's `model_pref` drives its turn; precedence is job pin > global pin > classifier (the global pin fallback lives in `runChatTurn` from Task 4).

- [ ] **Step 1: Pass the job's model pin into the turn**

In `app/api/cron/route.ts`, add the import:

```typescript
import { forceRouteForPref } from "@/lib/ai/model-prefs";
```

Replace the `runChatTurn` call (lines 88-91):

```typescript
  const { assistantText } = await runChatTurn({
    modelMessages,
    latestUserText: promptForModel,
  });
```

with:

```typescript
  const { assistantText } = await runChatTurn({
    modelMessages,
    latestUserText: promptForModel,
    forceRoute: forceRouteForPref(job.model_pref),
  });
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/route.ts
git commit -m "feat(llm): cron jobs honor a per-job model pin"
```

---

### Task 7: Swap background call-sites in `lib/` to the resolver

**Files:**
- Modify: `lib/ai/memory/reconcile.ts:112`
- Modify: `lib/ai/skills/judge.ts:45`
- Modify: `lib/ai/skills/propose.ts:60`
- Modify: `lib/ai/engine/claude.ts:172,224`
- Modify: `lib/chat/tools.ts:1590,1661`
- Modify: `lib/ai/meals/analyze.ts:80`
- Modify: `lib/ai/physique/analyze.ts:103`, `compare.ts:65`, `synthesize.ts:100`
- Modify: `lib/places/extract.ts:113,198`
- Modify: `lib/ai/agents/draft.ts:93`

**Interfaces:**
- Consumes: `modelForFeature` (`@/lib/ai/model-prefs`).

**The transformation (apply at every site below):**
1. Add `import { modelForFeature } from "@/lib/ai/model-prefs";` to the file.
2. Immediately before the `generateObject`/`generateText`/`streamText` call, add:
   `const { model, modelId } = await modelForFeature("<KEY>");` (all these call-sites are already inside `async` functions).
3. Replace the `model:` argument (`llmAuto()`, `llmFast()`, `llmOpus()`, or `anthropic("claude-…")`) with `model,`.
4. If the same function calls `recordModelUsage(<CONST>, …)` where `<CONST>` is the old static model label (`MODEL_SONNET`/`MODEL_HAIKU`/`MODEL_OPUS`/`BRIEF_MODEL_LABEL`/a string literal), replace `<CONST>` with `modelId` so the usage ledger records the model actually used.
5. Remove now-unused imports (`llmAuto`/`llmFast`/`llmOpus`/`MODEL_*`) flagged by tsc/lint. Keep `anthropic` if still used elsewhere in the file (e.g. `lib/chat/tools.ts` uses it for `web_search`).

**Site → feature key map:**

| File:line | KEY |
|---|---|
| `lib/ai/memory/reconcile.ts:112` | `memory` |
| `lib/ai/skills/judge.ts:45` | `skill_judge` |
| `lib/ai/skills/propose.ts:60` | `skill_propose` |
| `lib/ai/engine/claude.ts:172` (brief) | `brief` |
| `lib/ai/engine/claude.ts:224` (suggestions) | `suggestion` |
| `lib/chat/tools.ts:1590` | `brief` |
| `lib/chat/tools.ts:1661` | `brief` |
| `lib/ai/meals/analyze.ts:80` | `meal_analysis` |
| `lib/ai/physique/analyze.ts:103` | `physique_analysis` |
| `lib/ai/physique/compare.ts:65` | `physique_analysis` |
| `lib/ai/physique/synthesize.ts:100` | `physique_analysis` |
| `lib/places/extract.ts:113` | `place_extraction` |
| `lib/places/extract.ts:198` | `place_extraction` |
| `lib/ai/agents/draft.ts:93` | `agent_draft` |

- [ ] **Step 1: Apply the transformation to the memory site (representative — full before/after)**

`lib/ai/memory/reconcile.ts` — add import, then at line ~112:

Before:
```typescript
    const result = await generateObject({
      model: llmFast(),
```
After:
```typescript
    const { model, modelId } = await modelForFeature("memory");
    const result = await generateObject({
      model,
```
Then, if this file calls `recordModelUsage(MODEL_HAIKU, …)`, change that first argument to `modelId`. Remove the `llmFast`/`MODEL_HAIKU` import if now unused.

- [ ] **Step 2: Apply the transformation to the meal-analysis site (representative — direct anthropic)**

`lib/ai/meals/analyze.ts` — add import, then at line ~80:

Before:
```typescript
      model: anthropic("claude-sonnet-4-6"),
```
After:
```typescript
      const { model, modelId } = await modelForFeature("meal_analysis");
      // ...then in the generateObject/generateText call:
      model,
```
(Place the `const { model, modelId } = …` statement just above the `generateObject`/`generateText` call, not inside the options object.) Update any adjacent `recordModelUsage("claude-sonnet-4-6", …)` to `modelId`. Drop the `anthropic` import only if it has no other use in the file.

- [ ] **Step 3: Apply the transformation to the remaining sites**

Work through each remaining row of the map above using the recipe. For `lib/ai/engine/claude.ts` the two sites are distinct keys (`brief` at 172, `suggestion` at 224) — resolve each separately; `BRIEF_MODEL_LABEL` in those `recordModelUsage` calls becomes `modelId`. For `lib/chat/tools.ts` keep the `anthropic` import (used by `web_search`).

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit && npm run test`
Expected: PASS, no unused-import errors.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/memory/reconcile.ts lib/ai/skills/judge.ts lib/ai/skills/propose.ts lib/ai/engine/claude.ts lib/chat/tools.ts lib/ai/meals/analyze.ts lib/ai/physique/analyze.ts lib/ai/physique/compare.ts lib/ai/physique/synthesize.ts lib/places/extract.ts lib/ai/agents/draft.ts
git commit -m "feat(llm): route lib background call-sites through modelForFeature"
```

---

### Task 8: Swap background call-sites in `app/api/` to the resolver

**Files:**
- Modify: `app/api/skills/generate/route.ts:57`
- Modify: `app/api/cron/generate/route.ts:91`
- Modify: `app/api/calendar/extract/route.ts:92`
- Modify: `app/api/wife-shifts/extract/route.ts:113`
- Modify: `app/api/meetings/finalize/route.ts:215`

**Interfaces:**
- Consumes: `modelForFeature` (`@/lib/ai/model-prefs`).

Apply the same transformation recipe as Task 7.

**Site → feature key map:**

| File:line | KEY |
|---|---|
| `app/api/skills/generate/route.ts:57` | `skill_generate` |
| `app/api/cron/generate/route.ts:91` | `cron_generate` |
| `app/api/calendar/extract/route.ts:92` | `calendar_extract` |
| `app/api/wife-shifts/extract/route.ts:113` | `wife_shifts_extract` |
| `app/api/meetings/finalize/route.ts:215` | `meeting_finalize` |

- [ ] **Step 1: Apply the transformation to all five routes**

For each: add `import { modelForFeature } from "@/lib/ai/model-prefs";`, add `const { model, modelId } = await modelForFeature("<KEY>");` above the model call, replace the `model:` argument with `model`, swap any adjacent `recordModelUsage(<CONST>, …)` label to `modelId`, and remove now-unused `llmAuto`/`llmOpus`/`MODEL_*` imports.

- [ ] **Step 2: Typecheck + tests**

Run: `npx tsc --noEmit && npm run test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/skills/generate/route.ts app/api/cron/generate/route.ts app/api/calendar/extract/route.ts app/api/wife-shifts/extract/route.ts app/api/meetings/finalize/route.ts
git commit -m "feat(llm): route api background call-sites through modelForFeature"
```

---

### Task 9: Today's-usage-by-model read for the spend strip

**Files:**
- Modify: `lib/db/core/usage.ts`

**Interfaces:**
- Produces: `getModelUsageTodayCore(): Promise<{ model: string; calls: number; costUsd: number }[]>` — rows for `usage_events` created since 00:00 UTC today, grouped by model, sorted by cost desc.

- [ ] **Step 1: Add the read function**

Append to `lib/db/core/usage.ts` (it already imports `getSupabaseServer` + `getOwnerId`; reuse them):

```typescript
// Per-model rollup of today's usage (UTC day) for the /llm spend strip.
export async function getModelUsageTodayCore(): Promise<
  { model: string; calls: number; costUsd: number }[]
> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("usage_events")
    .select("model, cost_usd")
    .eq("owner_id", getOwnerId())
    .gte("created_at", startOfDay.toISOString());
  const rows = (data as { model: string; cost_usd: number }[] | null) ?? [];
  const byModel = new Map<string, { calls: number; costUsd: number }>();
  for (const r of rows) {
    const cur = byModel.get(r.model) ?? { calls: 0, costUsd: 0 };
    cur.calls += 1;
    cur.costUsd += r.cost_usd ?? 0;
    byModel.set(r.model, cur);
  }
  return [...byModel.entries()]
    .map(([model, v]) => ({ model, calls: v.calls, costUsd: v.costUsd }))
    .sort((a, b) => b.costUsd - a.costUsd);
}
```

(If `getSupabaseServer`/`getOwnerId` are not already imported in the file, add them: `import { getOwnerId } from "@/lib/auth/currentUser";` and `import { getSupabaseServer } from "@/lib/supabase/server";`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/db/core/usage.ts
git commit -m "feat(llm): today-by-model usage read for spend strip"
```

---

### Task 10: Server actions

**Files:**
- Create: `app/(app)/llm/actions.ts`

**Interfaces:**
- Consumes: `setModelPrefCore`, `invalidateModelPrefsCache`, `updateAgentCore`, `updateCronJobCore`, `setClaudeEnabledCore`.
- Produces: `setFeatureModelAction(featureKey, modelPref)`, `setAgentModelAction(agentId, modelPref)`, `setCronModelAction(cronId, modelPref)`, `setClaudeEnabledAction(enabled)`. Each returns `{ ok: true } | { ok: false; error: string }`.

- [ ] **Step 1: Write the actions**

Create `app/(app)/llm/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { invalidateModelPrefsCache } from "@/lib/ai/model-prefs";
import { updateAgentCore } from "@/lib/db/core/agents";
import { updateCronJobCore } from "@/lib/db/core/cron-jobs";
import { setModelPrefCore } from "@/lib/db/core/model-prefs";
import { setClaudeEnabledCore } from "@/lib/db/core/site-settings";
import type { AgentModelPref, ModelPref } from "@/lib/db/types";

function bump() {
  revalidatePath("/llm");
  revalidatePath("/chat");
  revalidatePath("/agents");
  revalidatePath("/cron");
}

export async function setFeatureModelAction(
  featureKey: string,
  modelPref: ModelPref,
) {
  const result = await setModelPrefCore(featureKey, modelPref);
  invalidateModelPrefsCache();
  if (result.ok) bump();
  return result;
}

export async function setAgentModelAction(
  agentId: string,
  modelPref: AgentModelPref,
) {
  const result = await updateAgentCore(agentId, { model_pref: modelPref });
  if (result.ok) bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function setCronModelAction(cronId: string, modelPref: ModelPref) {
  const result = await updateCronJobCore(cronId, { model_pref: modelPref });
  if (result.ok) bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function setClaudeEnabledAction(enabled: boolean) {
  const result = await setClaudeEnabledCore(enabled);
  if (result.ok) bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}
```

(Confirm `updateCronJobCore` and `updateAgentCore` signatures while implementing — both are `(id, patch) => Promise<CoreResult<...>>`. Adjust the result-shape mapping if a core returns a bare `{ ok, error }`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/(app)/llm/actions.ts
git commit -m "feat(llm): server actions for feature/agent/cron model + kill switch"
```

---

### Task 11: Page server component

**Files:**
- Create: `app/(app)/llm/page.tsx`

**Interfaces:**
- Consumes: `getModelPrefsCore`, `listAgentsCore` (or the existing agents list query), `listCronJobsCore`, `getSiteSettingsCore`, `getModelUsageTodayCore`, `FEATURES`.
- Produces: renders `LlmControlView` with all initial data.

- [ ] **Step 1: Write the page**

Create `app/(app)/llm/page.tsx` (confirm the agents list helper name while implementing — `listAgentsCore` from `@/lib/db/core/agents`):

```typescript
import { LlmControlView } from "@/components/modules/llm/LlmControlView";
import { listAgentsCore } from "@/lib/db/core/agents";
import { listCronJobsCore } from "@/lib/db/core/cron-jobs";
import { getModelPrefsCore } from "@/lib/db/core/model-prefs";
import { getSiteSettingsCore } from "@/lib/db/core/site-settings";
import { getModelUsageTodayCore } from "@/lib/db/core/usage";

export const dynamic = "force-dynamic";

export default async function LlmPage() {
  const [prefs, agents, cronJobs, settings, usage] = await Promise.all([
    getModelPrefsCore(),
    listAgentsCore(),
    listCronJobsCore(),
    getSiteSettingsCore(),
    getModelUsageTodayCore(),
  ]);

  return (
    <LlmControlView
      initialPrefs={prefs}
      agents={agents.map((a) => ({
        id: a.id,
        name: a.name,
        color: a.color,
        model_pref: a.model_pref,
      }))}
      cronJobs={cronJobs.map((c) => ({
        id: c.id,
        name: c.name,
        schedule: c.schedule,
        model_pref: c.model_pref,
      }))}
      claudeEnabled={settings.claude_enabled}
      usageToday={usage}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS once Task 12's `LlmControlView` exists; if running this task first, expect an unresolved-import error until Task 12. (Implement Task 12 immediately after.)

- [ ] **Step 3: Commit (after Task 12 compiles)**

Defer the commit to Task 12 so the page + view land together and typecheck cleanly.

---

### Task 12: Client control view

**Files:**
- Create: `components/modules/llm/LlmControlView.tsx`

**Interfaces:**
- Consumes: `FEATURES`, `FeatureDef`, `ModelPref`, `AgentModelPref`; the four server actions; UI primitives.
- Produces: the interactive `/llm` UI; each control change fires its action optimistically and reverts on failure.

- [ ] **Step 1: Write the view**

Create `components/modules/llm/LlmControlView.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  setAgentModelAction,
  setClaudeEnabledAction,
  setCronModelAction,
  setFeatureModelAction,
} from "@/app/(app)/llm/actions";
import { FEATURES, type FeatureDef, type FeatureGroup } from "@/lib/ai/model-prefs";
import type { AgentModelPref, ModelPref } from "@/lib/db/types";

type AgentRow = { id: string; name: string; color: string | null; model_pref: AgentModelPref };
type CronRow = { id: string; name: string; schedule: string; model_pref: ModelPref };
type UsageRow = { model: string; calls: number; costUsd: number };

type Props = {
  initialPrefs: Record<string, ModelPref>;
  agents: AgentRow[];
  cronJobs: CronRow[];
  claudeEnabled: boolean;
  usageToday: UsageRow[];
};

// Display metadata for the four wired models, reused across palette + selects.
const MODELS: { id: string; label: string; glyph: string; tier: string; vision: boolean; cost: string }[] = [
  { id: "claude-opus-4-7", label: "Opus 4.7", glyph: "◇", tier: "heavy", vision: true, cost: "$$$" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", glyph: "◆", tier: "balanced", vision: true, cost: "$$" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", glyph: "▸", tier: "fast", vision: true, cost: "$" },
  { id: "deepseek-chat", label: "DeepSeek", glyph: "✦", tier: "fallback", vision: false, cost: "¢" },
];

const GROUP_ORDER: FeatureGroup[] = [
  "Memory",
  "Skills",
  "Briefs & Suggestions",
  "Analyzers",
  "Extractors",
  "Agents",
];

// Options offered for a non-chat feature (DeepSeek hidden when vision is required).
function featureOptions(def: FeatureDef): ModelPref[] {
  const base: ModelPref[] = ["auto", "opus", "sonnet", "haiku"];
  return def.visionRequired ? base : [...base, "deepseek"];
}

const PREF_LABEL: Record<ModelPref, string> = {
  auto: "AUTO",
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
  deepseek: "deepseek",
};

export function LlmControlView({
  initialPrefs,
  agents,
  cronJobs,
  claudeEnabled,
  usageToday,
}: Props) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [agentPrefs, setAgentPrefs] = useState(() =>
    Object.fromEntries(agents.map((a) => [a.id, normalizeAgentPref(a.model_pref)])),
  );
  const [cronPrefs, setCronPrefs] = useState(() =>
    Object.fromEntries(cronJobs.map((c) => [c.id, c.model_pref])),
  );
  const [claudeOn, setClaudeOn] = useState(claudeEnabled);
  const [error, setError] = useState<string | null>(null);

  async function setFeature(key: string, value: ModelPref) {
    const prev = prefs[key] ?? "auto";
    setPrefs((p) => ({ ...p, [key]: value }));
    setError(null);
    const res = await setFeatureModelAction(key, value);
    if (!res.ok) {
      setPrefs((p) => ({ ...p, [key]: prev }));
      setError(res.error);
    }
  }

  async function setAgent(id: string, value: AgentModelPref) {
    const prev = agentPrefs[id];
    setAgentPrefs((p) => ({ ...p, [id]: value }));
    setError(null);
    const res = await setAgentModelAction(id, value);
    if (!res.ok) {
      setAgentPrefs((p) => ({ ...p, [id]: prev }));
      setError(res.error);
    }
  }

  async function setCron(id: string, value: ModelPref) {
    const prev = cronPrefs[id];
    setCronPrefs((p) => ({ ...p, [id]: value }));
    setError(null);
    const res = await setCronModelAction(id, value);
    if (!res.ok) {
      setCronPrefs((p) => ({ ...p, [id]: prev }));
      setError(res.error);
    }
  }

  async function toggleClaude() {
    const next = !claudeOn;
    setClaudeOn(next);
    setError(null);
    const res = await setClaudeEnabledAction(next);
    if (!res.ok) {
      setClaudeOn(!next);
      setError(res.error);
    }
  }

  const chatPref = prefs.chat ?? "auto";

  return (
    <>
      <PageHeader
        code="LLM"
        title="Model Control"
        subtitle="pin any LLM call-site to a model · AUTO = the system decides"
      />

      {error && (
        <div className="mb-4 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
          ! {error}
        </div>
      )}

      {/* kill switch + spend strip */}
      <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-edge bg-surface/40 p-4">
        <button
          onClick={toggleClaude}
          className="flex items-center gap-2 font-mono text-xs text-fg"
        >
          <StatusBadge tone={claudeOn ? "success" : "danger"}>
            {claudeOn ? "claude on" : "deepseek only"}
          </StatusBadge>
          <span className="text-fg-dim">(click to toggle)</span>
        </button>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-fg-muted">
          <span className="text-fg-dim uppercase tracking-wider">today</span>
          {usageToday.length === 0 && <span className="text-fg-dim">no calls yet</span>}
          {usageToday.map((u) => (
            <span key={u.model} className="flex items-center gap-1">
              <span className="text-accent">{glyphFor(u.model)}</span>
              {shortModel(u.model)} {u.calls} · ${u.costUsd.toFixed(2)}
            </span>
          ))}
        </div>
      </section>

      {/* model palette */}
      <section className="mb-5">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
          model palette
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {MODELS.map((m) => (
            <div key={m.id} className="rounded-md border border-edge bg-surface-2/40 p-3 font-mono">
              <div className="flex items-center gap-2 text-sm text-fg">
                <span className="text-accent">{m.glyph}</span>
                {m.label}
              </div>
              <div className="mt-1 text-[10px] text-fg-muted">
                {m.tier} · {m.vision ? "vision" : "no-vision"} · {m.cost}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* hero: main jarvis (chat) */}
      <section className="mb-5 rounded-md border border-accent/40 bg-accent/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-mono text-sm text-fg">
              <span className="text-accent">▣</span> Main JARVIS
              <StatusBadge tone={chatPref === "auto" ? "neutral" : "accent"}>
                {chatPref === "auto" ? "auto" : `pinned · ${PREF_LABEL[chatPref]}`}
              </StatusBadge>
            </div>
            <p className="mt-1 font-mono text-[11px] text-fg-muted">
              orchestrator for chat, Telegram & cron · AUTO runs the classifier
            </p>
          </div>
          <div className="w-44">
            <Select
              value={chatPref}
              onChange={(e) => setFeature("chat", e.target.value as ModelPref)}
            >
              {(["auto", "opus", "sonnet", "haiku", "deepseek"] as ModelPref[]).map((p) => (
                <option key={p} value={p}>{PREF_LABEL[p]}</option>
              ))}
            </Select>
          </div>
        </div>
      </section>

      {/* system call-sites, grouped */}
      {GROUP_ORDER.map((group) => {
        const defs = FEATURES.filter((f) => !f.routed && f.group === group);
        if (defs.length === 0) return null;
        return (
          <section key={group} className="mb-5">
            <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              {group}
            </h2>
            <div className="flex flex-col gap-2">
              {defs.map((def) => {
                const pref = prefs[def.key] ?? "auto";
                return (
                  <div
                    key={def.key}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-edge bg-surface/40 p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-mono text-xs text-fg">
                        {def.label}
                        <StatusBadge tone={pref === "auto" ? "neutral" : "accent"}>
                          {pref === "auto" ? `default · ${def.defaultTier}` : PREF_LABEL[pref]}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-fg-muted">{def.description}</p>
                    </div>
                    <div className="w-40">
                      <Select
                        value={pref}
                        onChange={(e) => setFeature(def.key, e.target.value as ModelPref)}
                      >
                        {featureOptions(def).map((p) => (
                          <option key={p} value={p}>{PREF_LABEL[p]}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* agents */}
      <section className="mb-5">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
          agents
        </h2>
        <div className="flex flex-col gap-2">
          {agents.length === 0 && (
            <p className="font-mono text-[11px] text-fg-dim">no agents yet</p>
          )}
          {agents.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-md border border-edge bg-surface/40 p-3"
            >
              <span className="flex items-center gap-2 font-mono text-xs text-fg">
                <span style={a.color ? { color: a.color } : undefined}>◔</span>
                {a.name}
              </span>
              <div className="w-40">
                <Select
                  value={agentPrefs[a.id]}
                  onChange={(e) => setAgent(a.id, e.target.value as AgentModelPref)}
                >
                  {(["auto", "opus", "sonnet", "haiku", "deepseek"] as AgentModelPref[]).map((p) => (
                    <option key={p} value={p}>{p === "auto" ? "AUTO" : p}</option>
                  ))}
                </Select>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* cron jobs */}
      <section className="mb-5">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
          cron jobs
        </h2>
        <div className="flex flex-col gap-2">
          {cronJobs.length === 0 && (
            <p className="font-mono text-[11px] text-fg-dim">no cron jobs yet</p>
          )}
          {cronJobs.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-md border border-edge bg-surface/40 p-3"
            >
              <span className="flex items-center gap-2 font-mono text-xs text-fg">
                <span className="text-accent">⏲</span>
                {c.name}
                <span className="text-fg-dim">{c.schedule}</span>
              </span>
              <div className="w-40">
                <Select
                  value={cronPrefs[c.id]}
                  onChange={(e) => setCron(c.id, e.target.value as ModelPref)}
                >
                  {(["auto", "opus", "sonnet", "haiku", "deepseek"] as ModelPref[]).map((p) => (
                    <option key={p} value={p}>{PREF_LABEL[p]}</option>
                  ))}
                </Select>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* skills note */}
      <section className="mb-5 rounded-md border border-edge bg-surface-2/30 p-3">
        <p className="font-mono text-[11px] text-fg-muted">
          <span className="text-accent">✦ skills</span> don&apos;t call a model
          directly — they ride the <span className="text-fg">Main JARVIS</span>,{" "}
          <span className="text-fg">Skill judge</span>, and{" "}
          <span className="text-fg">Skill proposer</span> call-sites above.
        </p>
      </section>
    </>
  );
}

// Legacy agent rows store "claude" — show it as opus in the select.
function normalizeAgentPref(pref: AgentModelPref): AgentModelPref {
  return pref === "claude" ? "opus" : pref;
}

function glyphFor(model: string): string {
  return MODELS.find((m) => m.id === model)?.glyph ?? "·";
}
function shortModel(model: string): string {
  return MODELS.find((m) => m.id === model)?.label ?? model;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (page + view resolve each other).

- [ ] **Step 3: Commit page + view together**

```bash
git add "app/(app)/llm/page.tsx" components/modules/llm/LlmControlView.tsx
git commit -m "feat(llm): /llm control page + interactive view"
```

---

### Task 13: Add the nav entry

**Files:**
- Modify: `lib/nav/order.ts:62-67` (the `system` section)

**Interfaces:**
- Produces: `/llm` link in the SYSTEM nav section.

- [ ] **Step 1: Add the item**

In `lib/nav/order.ts`, change the `system` section to:

```typescript
  {
    label: "system",
    items: [
      { href: "/settings", label: "Settings", code: "SET", glyph: "◇", status: "live" },
      { href: "/llm", label: "LLM", code: "LLM", glyph: "◈", status: "live" },
    ],
  },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/nav/order.ts
git commit -m "feat(llm): add /llm to the SYSTEM nav section"
```

---

### Task 14: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck, tests, build**

Run: `npx tsc --noEmit && npm run test && npm run build`
Expected: all PASS; build completes with `/llm` in the route list.

- [ ] **Step 2: Manual smoke (dev server)**

Run `npm run dev`, then verify:
- `/llm` renders under SYSTEM with palette, hero, grouped call-sites, agents, cron, skills note.
- Pin **Main JARVIS** to `haiku`; reload — selection persists. Send a chat message; the reply's model tag shows haiku (classifier bypassed). Set back to AUTO.
- Change an agent's and a cron job's model; reload — both persist.
- Toggle the Claude kill switch; confirm the badge flips and persists.
- A vision feature (e.g. Meal analysis) shows no DeepSeek option.

- [ ] **Step 3: Final commit (if any manual fixups)**

```bash
git add -A
git commit -m "fix(llm): verification fixups"
```

---

## Self-Review

**Spec coverage:**
- `/llm` page under SYSTEM → Tasks 11, 12, 13. ✓
- DB override layer (`model_prefs`) → Tasks 1, 2. ✓
- Resolver with vision/default semantics → Task 3 (TDD). ✓
- Global JARVIS pin instead of AUTO → Task 4. ✓
- Per-call-site overrides for all background features → Tasks 7, 8 (full site list). ✓
- Agents inline + full tiers → Task 5. ✓
- Cron per-job model + inline edit → Tasks 1, 6, 12. ✓
- Spend-by-model visualization → Tasks 9, 12. ✓
- Vision guard hides DeepSeek → Tasks 3, 12. ✓
- Skills shown as governed-by, no fake dropdown → Task 12. ✓

**Placeholder scan:** Two call-site tasks (7, 8) use a transformation recipe + exact site table rather than 19 near-identical code blocks; each site has an exact file:line, key, and before/after pattern shown on representative sites. This is mechanical and verified by `tsc` + tests. All other tasks contain complete code.

**Type consistency:** `ModelPref` (5 values) used for features/cron; `AgentModelPref` (broadened, includes legacy `claude`) for agents; `FeatureKey`/`FeatureDef` consistent between `lib/ai/model-prefs.ts`, the page, and the view; `modelForFeature` returns `{ model, modelId }` and excludes `"chat"`; `forceRouteForPref` returns `ForceRoute | undefined`; `chatForceRoute`/`forceRouteForPref` wired identically in `runChatTurn`, the web route, and cron.

**Open items to confirm during implementation (not blockers):**
- Exact agents list helper name (`listAgentsCore`) and `updateAgentCore`/`updateCronJobCore` return shapes.
- Whether each background file actually calls `recordModelUsage` (the recipe handles both cases).
- Migration application path (Supabase editor vs `db push`).
