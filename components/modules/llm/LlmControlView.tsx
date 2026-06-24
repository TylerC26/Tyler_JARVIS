"use client";

import { useState } from "react";
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

type AgentRow = {
  id: string;
  name: string;
  color: string | null;
  model_pref: AgentModelPref;
};
type CronRow = { id: string; name: string; schedule: string; model_pref: ModelPref };
type UsageRow = { model: string; calls: number; costUsd: number };

type Props = {
  initialPrefs: Record<string, ModelPref>;
  agents: AgentRow[];
  cronJobs: CronRow[];
  claudeEnabled: boolean;
  usageToday: UsageRow[];
};

// Display metadata for the wired models, reused across palette + selects.
const MODELS: {
  id: string;
  label: string;
  glyph: string;
  tier: string;
  vision: boolean;
  cost: string;
}[] = [
  { id: "claude-opus-4-7", label: "Opus 4.7", glyph: "◇", tier: "heavy", vision: true, cost: "$$$" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", glyph: "◆", tier: "balanced", vision: true, cost: "$$" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", glyph: "▸", tier: "fast", vision: true, cost: "$" },
  { id: "deepseek-chat", label: "DeepSeek", glyph: "✦", tier: "fallback", vision: false, cost: "¢" },
  { id: "MiniMax-M3", label: "MiniMax M3", glyph: "✸", tier: "agentic", vision: true, cost: "¢" },
];

const GROUP_ORDER: FeatureGroup[] = [
  "Memory",
  "Skills",
  "Briefs & Suggestions",
  "Analyzers",
  "Extractors",
  "Tools",
  "Agents",
];

// Options offered for a non-chat feature. DeepSeek is text-only, so it's hidden
// when the call-site requires vision; MiniMax-M3 is multimodal, so it's offered
// everywhere.
function featureOptions(def: FeatureDef): ModelPref[] {
  const base: ModelPref[] = ["auto", "opus", "sonnet", "haiku"];
  return def.visionRequired
    ? [...base, "minimax"]
    : [...base, "deepseek", "minimax"];
}

const PREF_LABEL: Record<ModelPref, string> = {
  auto: "AUTO",
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
  deepseek: "deepseek",
  minimax: "minimax",
};

export function LlmControlView({
  initialPrefs,
  agents,
  cronJobs,
  claudeEnabled,
  usageToday,
}: Props) {
  const [prefs, setPrefs] = useState(initialPrefs);
  const [agentPrefs, setAgentPrefs] = useState<Record<string, AgentModelPref>>(() =>
    Object.fromEntries(agents.map((a) => [a.id, normalizeAgentPref(a.model_pref)])),
  );
  const [cronPrefs, setCronPrefs] = useState<Record<string, ModelPref>>(() =>
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
          <span className="uppercase tracking-wider text-fg-dim">today</span>
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
            <div
              key={m.id}
              className="rounded-md border border-edge bg-surface-2/40 p-3 font-mono"
            >
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
              orchestrator for chat, Telegram &amp; cron · AUTO runs the classifier
            </p>
          </div>
          <div className="w-44">
            <Select
              value={chatPref}
              onChange={(e) => setFeature("chat", e.target.value as ModelPref)}
            >
              {(["auto", "opus", "sonnet", "haiku", "deepseek", "minimax"] as ModelPref[]).map((p) => (
                <option key={p} value={p}>
                  {PREF_LABEL[p]}
                </option>
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
                      <p className="mt-1 font-mono text-[10px] text-fg-muted">
                        {def.description}
                      </p>
                    </div>
                    <div className="w-40">
                      <Select
                        value={pref}
                        onChange={(e) => setFeature(def.key, e.target.value as ModelPref)}
                      >
                        {featureOptions(def).map((p) => (
                          <option key={p} value={p}>
                            {PREF_LABEL[p]}
                          </option>
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
                  {(["auto", "opus", "sonnet", "haiku", "deepseek", "minimax"] as AgentModelPref[]).map((p) => (
                    <option key={p} value={p}>
                      {p === "auto" ? "AUTO" : p}
                    </option>
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
                  {(["auto", "opus", "sonnet", "haiku", "deepseek", "minimax"] as ModelPref[]).map((p) => (
                    <option key={p} value={p}>
                      {PREF_LABEL[p]}
                    </option>
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
