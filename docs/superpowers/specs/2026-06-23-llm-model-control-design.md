# LLM Model Control Center (`/llm`) — Design

**Date:** 2026-06-23
**Branch:** `feat/llm-model-control`
**Status:** Approved design, pre-implementation

## Goal

A single page under the `system` nav section where every LLM call-site in JARVIS
can be seen and overridden — pinned to a specific model or left on `AUTO`. Covers
the main chat orchestrator, background tasks, agents, and cron jobs. JARVIS can be
set to a fixed model instead of the AUTO classifier.

## Approach

A DB-backed **override layer** consulted by a small resolver at runtime. Every
call-site keeps its current behavior as the *default*; an override only changes
what's explicitly set. Overrides live in Supabase (not localStorage) because cron
jobs, agents, and background tasks run server-side.

The chat panel's existing per-request `forceRoute` (the dropdown) still wins over
the saved default — live chat choices are never overridden by this page.

- Route: `/llm` (lowercase, matching `/settings`, `/progress`).
- Nav: code `LLM`, glyph `◈`, added to the existing `system` section in
  `lib/nav/order.ts` next to Settings.

## Data Model

Migration `supabase/migrations/0055_model_prefs.sql`:

- **New table `model_prefs`** — `(owner_id text, feature_key text, model_pref text,
  updated_at timestamptz)`, PK `(owner_id, feature_key)`. One row per *named
  call-site* that has been overridden; an absent row means `auto`. RLS/grants
  mirror the most recent existing table (see `0054_task_meeting.sql` /
  `0050_body_metrics.sql` for the pattern).
- **`cron_jobs`** — add `model_pref text not null default 'auto'`.
- **`agents.model_pref`** — already exists (text, no DB CHECK constraint). We
  broaden the accepted values app-side only; no schema change.

### Vocabulary

`model_pref ∈ { auto | opus | sonnet | haiku | deepseek }` everywhere.

`auto` means "use the coded default":
- For `chat` → run the classifier (current behavior).
- For a fixed-tier task → its current hardcoded tier.

Models stay the four already wired:
`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`, `deepseek-chat`.
Adding a model later is a one-line registry edit.

## Core Unit: Feature Registry + Resolver

`lib/ai/model-prefs.ts`:

- **`FEATURES`** — canonical list of call-sites. Each:
  `{ key, label, description, group, defaultTier, visionRequired }`. Discovered by
  grepping every `llmAuto()`/`llmFast()`/`llmOpus()` and direct
  `anthropic("claude-…")` call. Full set (the route classifier itself is excluded
  — overriding the routing brain is a footgun):

  | key | group | default tier | call-site(s) | vision |
  |---|---|---|---|---|
  | `chat` | Routing | classifier (auto) | `decideRoute` via forceRoute | — |
  | `memory` | Memory | haiku | `lib/ai/memory/reconcile.ts:112` | no |
  | `skill_judge` | Skills | sonnet | `lib/ai/skills/judge.ts:45` | no |
  | `skill_propose` | Skills | sonnet | `lib/ai/skills/propose.ts:60` | no |
  | `skill_generate` | Skills | sonnet | `app/api/skills/generate/route.ts:57` | no |
  | `brief` | Briefs | opus | `lib/ai/engine/claude.ts:172`, `lib/chat/tools.ts:1590,1661` | no |
  | `suggestion` | Briefs | opus | `lib/ai/engine/claude.ts:224` | no |
  | `cron_generate` | Briefs | opus | `app/api/cron/generate/route.ts:91` | no |
  | `meal_analysis` | Analyzers | sonnet | `lib/ai/meals/analyze.ts:80` | yes |
  | `physique_analysis` | Analyzers | sonnet | `lib/ai/physique/{analyze:103,compare:65,synthesize:100}.ts` | yes |
  | `place_extraction` | Extractors | sonnet | `lib/places/extract.ts:113,198` | yes |
  | `calendar_extract` | Extractors | sonnet | `app/api/calendar/extract/route.ts:92` | yes |
  | `wife_shifts_extract` | Extractors | sonnet | `app/api/wife-shifts/extract/route.ts:113` | yes |
  | `meeting_finalize` | Extractors | sonnet | `app/api/meetings/finalize/route.ts:215` | no |
  | `agent_draft` | Agents | sonnet | `lib/ai/agents/draft.ts:93` | no |

- **`modelForFeature(key): Promise<{ model: LanguageModel; modelId: string }>`** —
  returns both the AI-SDK model and its id so the usage ledger label stays accurate
  (it feeds the spend strip). Resolution:
  1. On `auto`/missing → the key's coded default tier.
  2. Honors the Claude kill switch: when `isClaudeEnabled()` is false, any Claude
     pref falls back to DeepSeek (mirrors existing call-site behavior).
  3. **Vision guard:** a `deepseek` pref on a `visionRequired` feature is dropped
     back to the default tier (`deepseek-chat` isn't vision-capable). The page also
     hides DeepSeek in those selectors.
  4. Never throws on the hot path: a DB read error → coded default.

- **`chatForceRoute(): Promise<ForceRoute | undefined>`** — maps the `chat` pref
  to a `ForceRoute` (`opus|sonnet|haiku|deepseek`) for `decideRoute`; `auto`/missing
  → `undefined` (classifier runs).

- **Caching:** prefs read in one query (`getModelPrefsCore`) and cached in-module
  with a short TTL + cache-bust on save, so the chat hot path doesn't hit Supabase
  every turn.

This module is branch-heavy pure logic → **unit tested first** (vitest, matching
existing `*.test.ts` in `lib/db/core/`). Cases: pref precedence, `auto` →
default per key, vision fallback for DeepSeek, kill-switch → DeepSeek, DB-error →
default.

## DB Core

`lib/db/core/model-prefs.ts` (mirrors `site-settings.ts`):
- `getModelPrefsCore(): Promise<Record<FeatureKey, ModelPref>>`
- `setModelPrefCore(featureKey, modelPref): Promise<CoreResult<...>>` — upsert on
  `(owner_id, feature_key)`.
- cached accessor + `invalidateModelPrefsCache()` called on every set.

## Wiring (where the resolver plugs in)

- **Chat (web)**: `app/api/chat/route.ts` calls `decideRoute` directly →
  `forceRoute: forceRoute ?? (await chatForceRoute())`. Request dropdown wins over
  the saved global pin.
- **Chat (cron + Telegram)**: both go through `runChatTurn` (`lib/chat/turn.ts`),
  which gains the same `forceRoute ?? (await chatForceRoute())` fallback. So the
  global "MAIN JARVIS" pin applies to scheduled and Telegram turns too.
- **Cron per-job**: `runJob` (`app/api/cron/route.ts`) passes
  `forceRoute: forceRouteForPref(job.model_pref)` (`auto` → `undefined`). Combined
  with the fallback above, precedence is **job pin > global pin > classifier**.
- **`decideRoute` itself stays pure** — all fallback logic lives at the call layer.
- **Background tasks**: each `llmAuto()` / `llmFast()` / `llmOpus()` / direct
  `anthropic("claude-…")` call-site swapped for
  `const { model, modelId } = await modelForFeature("<key>")`; any adjacent
  `recordModelUsage(MODEL_X, …)` label switched to `modelId`. The provider helpers
  remain as the default-tier implementations the resolver falls back to.
- **Agents**: extend `pickModel` in `lib/ai/agents/run.ts` to map
  `opus/sonnet/haiku/deepseek`, keeping legacy `claude` → opus and `auto` → sonnet.
  Broaden the `AgentModelPref` type.

## Page (`/llm`)

Server component (`app/(app)/llm/page.tsx`, `dynamic = "force-dynamic"`) loads in
parallel: feature prefs, agents, cron jobs, site settings, and a "today by model"
usage summary from `usage_events`. A `LlmControlView` client component
(`components/modules/llm/`) renders it. Each control change fires a server action
immediately (optimistic) → upsert → `revalidatePath("/llm")`. Mirrors the
`SettingsView` pattern.

Server actions (`app/(app)/llm/actions.ts`):
- `setFeatureModelAction(featureKey, modelPref)`
- `setAgentModelAction(agentId, modelPref)`
- `setCronModelAction(cronId, modelPref)`
- `setClaudeEnabledAction(enabled)` (reuses `setClaudeEnabledCore`)

Layout:

```
┌─ LLM · MODEL CONTROL ─────────────────────────────────┐
│  [Claude: ●ON]   today: ◇opus 2  ◆sonnet 14  ▸hk 31   │  kill switch + spend-by-model strip
├───────────────────────────────────────────────────────┤
│  MODEL PALETTE                                         │
│  ◇ Opus 4.7   heavy · vision · $$$                     │  legend: role / vision / relative cost
│  ◆ Sonnet 4.6 balanced · vision · $$                   │
│  ▸ Haiku 4.5  fast · vision · $                        │
│  ✦ DeepSeek   fallback · no-vision · ¢                 │
├───────────────────────────────────────────────────────┤
│  ▣ MAIN JARVIS            [AUTO][opus][sonnet][haiku]  │  hero = chat feature
│     routing · classifier picks tier when AUTO          │
├───────────────────────────────────────────────────────┤
│  SYSTEM CALL-SITES  (grouped)                         │
│   Skills    · skill_judge   default Sonnet  [AUTO|...] │
│   Memory    · reconcile     default Haiku   [AUTO|...] │
│   Briefs    · brief         default Opus    [AUTO|...] │
│   Analyzers · meal_analysis default Sonnet  [AUTO|S|H] │  deepseek hidden (vision)
├───────────────────────────────────────────────────────┤
│  AGENTS     Matt ◔  [auto|opus|sonnet|haiku|deepseek]  │  inline → agents.model_pref
│  CRON JOBS  Profile Synthesis ⏲ 07:00 [auto|...]      │  inline → new model_pref
├───────────────────────────────────────────────────────┤
│  SKILLS — ride Chat + Skill Judge above (info only)    │
└───────────────────────────────────────────────────────┘
```

Styling: existing terminal/mono theme, `PageHeader`, `Button`/`StatusBadge`/`Input`.
Each model gets a consistent glyph + accent color reused across palette, selectors,
and spend strip. Per-feature selectors filter out models the feature can't use
(DeepSeek hidden for vision features).

## Types

`lib/db/types.ts`: add `ModelPref` and `FeatureKey` types, add `model_pref` to
`CronJob`, broaden `AgentModelPref` to `auto | claude | opus | sonnet | haiku |
deepseek` (`claude` kept as legacy alias).

## Error Handling

- Resolver never throws on hot paths → DB error falls back to coded default
  (same posture as `isClaudeEnabled`).
- Server actions return `{ ok, error }`; UI surfaces inline errors and reverts the
  optimistic change on failure.

## Testing

- Unit tests for `lib/ai/model-prefs.ts` resolver (written first, TDD).
- Manual verification: change each control, confirm persistence across reload and
  that a pinned `chat` model bypasses the classifier.

## Scope Guardrails (YAGNI — explicitly out)

- No new model IDs beyond the four already wired.
- No per-skill model dropdowns (skills don't call their own model).
- No routing-*prompt* editing (that's the Settings page).
- No historical analytics beyond the simple "today by model" strip.

## Decisions made without asking (flag to revisit)

- Route is lowercase `/llm`.
- Keep only the four existing models.
- "Today's spend by model" strip is the only usage visualization in v1.
