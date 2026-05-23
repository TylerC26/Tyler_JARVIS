"use client";

import { useEffect, useState } from "react";
import {
  createAgentAction,
  deleteAgentAction,
  draftAgentAction,
  toggleAgentActiveAction,
  updateAgentAction,
} from "@/app/(app)/agents/actions";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Agent, AgentModelPref } from "@/lib/db/types";

// The create flow is two-phase: "describe" collects a one-line description and
// has Sonnet draft the rest; "review" is the full form, pre-filled and
// editable, before the agent is saved. Edit always opens straight to the form.
type Editing =
  | { kind: "closed" }
  | { kind: "create"; phase: "describe" | "review" }
  | { kind: "edit"; agent: Agent };

type FormState = {
  name: string;
  slug: string;
  description: string;
  system_prompt: string;
  tool_allowlist: string[];
  model_pref: AgentModelPref;
  color: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  description: "",
  system_prompt: "",
  tool_allowlist: [],
  model_pref: "claude",
  color: "",
};

export function AgentsView({
  initialAgents,
  allToolNames,
}: {
  initialAgents: Agent[];
  allToolNames: string[];
}) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [editing, setEditing] = useState<Editing>({ kind: "closed" });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [describeText, setDescribeText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setAgents(initialAgents);
  }, [initialAgents]);

  function openCreate() {
    setError(null);
    setForm(EMPTY_FORM);
    setDescribeText("");
    setEditing({ kind: "create", phase: "describe" });
  }

  function openEdit(agent: Agent) {
    setError(null);
    setForm({
      name: agent.name,
      slug: agent.slug,
      description: agent.description,
      system_prompt: agent.system_prompt,
      tool_allowlist: agent.tool_allowlist,
      model_pref: agent.model_pref,
      color: agent.color ?? "",
    });
    setEditing({ kind: "edit", agent });
  }

  function close() {
    setEditing({ kind: "closed" });
    setForm(EMPTY_FORM);
    setDescribeText("");
    setError(null);
  }

  function toggleTool(name: string) {
    setForm((f) => ({
      ...f,
      tool_allowlist: f.tool_allowlist.includes(name)
        ? f.tool_allowlist.filter((t) => t !== name)
        : [...f.tool_allowlist, name],
    }));
  }

  // Phase 1 → 2: hand the description to Sonnet, drop its draft into the form,
  // and advance to the review phase. On failure, stay on describe with the
  // error shown so the user can retry or skip to manual entry.
  async function generate() {
    if (!describeText.trim() || drafting) return;
    setError(null);
    setDrafting(true);
    try {
      const res = await draftAgentAction(describeText);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setForm({
        name: res.data.name,
        slug: res.data.slug,
        description: res.data.description,
        system_prompt: res.data.system_prompt,
        tool_allowlist: res.data.tool_allowlist.filter((t) =>
          allToolNames.includes(t),
        ),
        model_pref: res.data.model_pref,
        color: res.data.color,
      });
      setEditing({ kind: "create", phase: "review" });
    } finally {
      setDrafting(false);
    }
  }

  function fillManually() {
    setError(null);
    setForm(EMPTY_FORM);
    setEditing({ kind: "create", phase: "review" });
  }

  function backToDescribe() {
    setError(null);
    setEditing({ kind: "create", phase: "describe" });
  }

  async function save() {
    setError(null);
    setPending(true);
    try {
      if (editing.kind === "create") {
        const res = await createAgentAction({
          name: form.name,
          slug: form.slug || undefined,
          description: form.description,
          system_prompt: form.system_prompt,
          tool_allowlist: form.tool_allowlist,
          model_pref: form.model_pref,
          color: form.color || null,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setAgents((prev) => [...prev, res.data]);
        close();
      } else if (editing.kind === "edit") {
        const res = await updateAgentAction(editing.agent.id, {
          name: form.name,
          description: form.description,
          system_prompt: form.system_prompt,
          tool_allowlist: form.tool_allowlist,
          model_pref: form.model_pref,
          color: form.color || null,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setAgents((prev) =>
          prev.map((a) => (a.id === res.data.id ? res.data : a)),
        );
        close();
      }
    } finally {
      setPending(false);
    }
  }

  async function toggle(agent: Agent) {
    setBusyId(agent.id);
    try {
      const res = await toggleAgentActiveAction(agent.id, !agent.active);
      if (res.ok) {
        setAgents((prev) =>
          prev.map((a) => (a.id === res.data.id ? res.data : a)),
        );
      }
    } finally {
      setBusyId(null);
    }
  }

  async function remove(agent: Agent) {
    if (!confirm(`Delete agent "${agent.name}"?`)) return;
    setBusyId(agent.id);
    try {
      const res = await deleteAgentAction(agent.id);
      if (res.ok) {
        setAgents((prev) => prev.filter((a) => a.id !== agent.id));
      }
    } finally {
      setBusyId(null);
    }
  }

  const isDescribe = editing.kind === "create" && editing.phase === "describe";
  const showForm =
    editing.kind === "edit" ||
    (editing.kind === "create" && editing.phase === "review");

  const modalTitle =
    editing.kind === "edit"
      ? `Edit · ${form.name}`
      : isDescribe
        ? "New Agent"
        : `Review · ${form.name || "New Agent"}`;

  const modalSubtitle = isDescribe
    ? "describe it — Sonnet drafts the rest"
    : "sub-agent config";

  const footer = isDescribe ? (
    <>
      <Button variant="ghost" onClick={close} disabled={drafting}>
        cancel
      </Button>
      <Button
        variant="primary"
        onClick={generate}
        disabled={drafting || !describeText.trim()}
      >
        {drafting ? "drafting…" : "generate with Sonnet"}
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={close} disabled={pending}>
        cancel
      </Button>
      {editing.kind === "create" && (
        <Button variant="ghost" onClick={backToDescribe} disabled={pending}>
          back
        </Button>
      )}
      <Button variant="primary" onClick={save} disabled={pending}>
        {pending ? "saving…" : "save"}
      </Button>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        code="AGT"
        title="Agents"
        subtitle="Sub-agents Jarvis can delegate to. Each has its own system prompt + tool subset."
        actions={
          <Button variant="primary" onClick={openCreate}>
            + new agent
          </Button>
        }
      />

      {agents.length === 0 ? (
        <div className="rounded-md border border-edge bg-surface/70 p-8 text-center font-mono text-sm text-fg-dim">
          // no agents yet — seeded set will appear on first chat load
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {agents.map((a) => (
            <article
              key={a.id}
              className="flex flex-col gap-2 rounded-md border border-edge bg-surface/70 p-3"
            >
              <header className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: a.color ?? "#00d9ff" }}
                    aria-hidden
                  />
                  <span className="font-mono text-sm text-fg truncate">
                    {a.name}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
                    /{a.slug}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge
                    tone={a.active ? "success" : "neutral"}
                    status={a.active ? "active" : "off"}
                  />
                  <StatusBadge tone="neutral">{a.source}</StatusBadge>
                </div>
              </header>

              <p className="font-mono text-xs text-fg-muted leading-relaxed">
                {a.description}
              </p>

              <div className="flex flex-wrap gap-1">
                {a.tool_allowlist.length === 0 ? (
                  <span className="font-mono text-[10px] text-fg-dim">
                    no tools (text-only)
                  </span>
                ) : (
                  a.tool_allowlist.map((t) => (
                    <span
                      key={t}
                      className="rounded-sm border border-edge bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted"
                    >
                      {t}
                    </span>
                  ))
                )}
              </div>

              <footer className="flex items-center justify-between gap-2 border-t border-edge pt-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
                  model: {a.model_pref}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === a.id}
                    onClick={() => toggle(a)}
                  >
                    {a.active ? "disable" : "enable"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(a)}
                  >
                    edit
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busyId === a.id}
                    onClick={() => remove(a)}
                  >
                    delete
                  </Button>
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}

      <AddItemModal
        open={editing.kind !== "closed"}
        onClose={close}
        title={modalTitle}
        subtitle={modalSubtitle}
        footer={footer}
      >
        <div className="flex flex-col gap-3">
          {error && (
            <div className="rounded-sm border border-danger/40 bg-danger/10 px-2 py-1.5 font-mono text-[11px] text-danger">
              {error}
            </div>
          )}

          {isDescribe && (
            <>
              <Field
                label="describe the agent"
                hint="One or two sentences — what it should do, when Jarvis should delegate to it. Sonnet writes the name, prompt, tools, and the rest."
              >
                <Textarea
                  rows={5}
                  autoFocus
                  value={describeText}
                  placeholder="e.g. An agent that reviews my open tasks each morning, flags anything overdue or stalled, and suggests what to tackle first."
                  onChange={(e) => setDescribeText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      generate();
                    }
                  }}
                />
              </Field>
              <div className="flex items-center justify-between gap-2">
                {/* Hidden on touch — ⌘ isn't a useful hint there. */}
                <span className="hidden font-mono text-[10px] text-fg-dim md:inline">
                  ⌘↵ to generate
                </span>
                <span className="md:hidden" aria-hidden />
                <button
                  type="button"
                  onClick={fillManually}
                  className="font-mono text-[11px] text-fg-dim underline decoration-dotted underline-offset-2 hover:text-fg"
                >
                  skip — fill in manually
                </button>
              </div>
            </>
          )}

          {showForm && (
            <>
              {editing.kind === "create" && (
                <p className="font-mono text-[11px] text-fg-dim leading-relaxed">
                  // drafted by Sonnet — review and tweak anything before
                  saving
                </p>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="name">
                  <Input
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </Field>
                <Field
                  label="slug"
                  hint={
                    editing.kind === "edit"
                      ? "slug is read-only after creation"
                      : "auto-derived from name if blank"
                  }
                >
                  <Input
                    value={form.slug}
                    disabled={editing.kind === "edit"}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, slug: e.target.value }))
                    }
                  />
                </Field>
              </div>

              <Field
                label="description"
                hint="One sentence shown in agents list and the system prefix."
              >
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </Field>

              <Field
                label="system prompt"
                hint="Addressed to the agent in second person. Be concrete about behavior + output format."
              >
                <Textarea
                  rows={8}
                  value={form.system_prompt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, system_prompt: e.target.value }))
                  }
                />
              </Field>

              <Field
                label={`tool allowlist (${form.tool_allowlist.length}/${allToolNames.length})`}
                hint="Pick the tools this agent can call. Leave empty for a text-only specialist."
              >
                <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto rounded-sm border border-edge bg-surface-2 p-2">
                  {allToolNames.map((name) => {
                    const on = form.tool_allowlist.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleTool(name)}
                        className={[
                          "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] transition-colors",
                          on
                            ? "border-accent/60 bg-accent/15 text-accent"
                            : "border-edge bg-surface text-fg-muted hover:text-fg",
                        ].join(" ")}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="model preference">
                  <Select
                    value={form.model_pref}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        model_pref: e.target.value as AgentModelPref,
                      }))
                    }
                  >
                    <option value="claude">claude (opus 4.7)</option>
                    <option value="deepseek">deepseek</option>
                    <option value="auto">auto (whichever configured)</option>
                  </Select>
                </Field>
                <Field label="color" hint="Optional hex (e.g. #00d9ff).">
                  <Input
                    value={form.color}
                    placeholder="#00d9ff"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, color: e.target.value }))
                    }
                  />
                </Field>
              </div>
            </>
          )}
        </div>
      </AddItemModal>
    </div>
  );
}
