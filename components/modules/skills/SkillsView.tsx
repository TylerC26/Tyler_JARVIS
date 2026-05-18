"use client";

import { useEffect, useState } from "react";
import {
  createSkillAction,
  deleteSkillAction,
  toggleSkillActiveAction,
  updateSkillAction,
} from "@/app/(app)/skills/actions";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Skill } from "@/lib/db/types";

type Editing =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; skill: Skill };

type FormState = {
  name: string;
  description: string;
  instructions: string;
  triggers: string; // comma-separated input
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  instructions: "",
  triggers: "",
};

// Quick-start scaffolds the user can one-click into the New Skill form.
const QUICK_START_TEMPLATES: Array<{
  label: string;
  form: FormState;
}> = [
  {
    label: "Gym / Training",
    form: {
      name: "Gym Training",
      description:
        "Quick workout log + tomorrow's session suggestion from a simple weekly split.",
      triggers: "log workout, gym, today's lift",
      instructions: "",
    },
  },
  {
    label: "Travel Mode",
    form: {
      name: "Travel Mode",
      description:
        "For multi-day travel events: pre-flight checklist and packing prompts.",
      triggers: "going on a trip, travel checklist, packing",
      instructions: "",
    },
  },
];

function isDraft(s: Skill): boolean {
  return s.source === "jarvis" && !s.active;
}

// Drafts float to the top of the list so newly-proposed skills are easy to
// spot. Within each group we sort alphabetically.
function sortForView(skills: Skill[]): Skill[] {
  return [...skills].sort((a, b) => {
    const ad = isDraft(a) ? 0 : 1;
    const bd = isDraft(b) ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.name.localeCompare(b.name);
  });
}

export function SkillsView({
  initialSkills,
  refinementCritiques = {},
}: {
  initialSkills: Skill[];
  refinementCritiques?: Record<string, string>;
}) {
  const [skills, setSkills] = useState<Skill[]>(() => sortForView(initialSkills));
  const [editing, setEditing] = useState<Editing>({ kind: "closed" });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setSkills(sortForView(initialSkills));
  }, [initialSkills]);

  function openCreate(prefill?: FormState) {
    setError(null);
    setForm(prefill ?? EMPTY_FORM);
    setEditing({ kind: "create" });
  }

  function openEdit(skill: Skill) {
    setError(null);
    setForm({
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      triggers: skill.trigger_keywords.join(", "),
    });
    setEditing({ kind: "edit", skill });
  }

  function close() {
    setEditing({ kind: "closed" });
    setForm(EMPTY_FORM);
    setError(null);
  }

  function parseTriggers(raw: string): string[] {
    return raw
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  async function onSave() {
    setError(null);
    const triggers = parseTriggers(form.triggers);
    if (!form.name.trim() || !form.description.trim() || !form.instructions.trim()) {
      setError("Name, description, and instructions are all required.");
      return;
    }
    if (triggers.length === 0) {
      setError("At least one trigger keyword is required.");
      return;
    }

    setPending(true);
    try {
      if (editing.kind === "create") {
        const result = await createSkillAction({
          name: form.name,
          description: form.description,
          instructions: form.instructions,
          trigger_keywords: triggers,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSkills((prev) => sortForView([...prev, result.skill]));
      } else if (editing.kind === "edit") {
        const result = await updateSkillAction(editing.skill.id, {
          name: form.name,
          description: form.description,
          instructions: form.instructions,
          trigger_keywords: triggers,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSkills((prev) =>
          sortForView(prev.map((s) => (s.id === result.skill.id ? result.skill : s))),
        );
      }
      close();
    } finally {
      setPending(false);
    }
  }

  async function onGenerate() {
    setError(null);
    if (!form.name.trim() || !form.description.trim()) {
      setError("Name and description must be filled before generating.");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/skills/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          trigger_keywords: parseTriggers(form.triggers),
        }),
      });
      const data = (await res.json()) as { instructions?: string; error?: string };
      if (!res.ok || !data.instructions) {
        setError(data.error ?? "Could not generate.");
        return;
      }
      setForm((f) => ({ ...f, instructions: data.instructions! }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function onToggleActive(skill: Skill) {
    setBusyId(skill.id);
    const result = await toggleSkillActiveAction(skill.id, !skill.active);
    setBusyId(null);
    if (!result.ok) {
      alert(`Toggle failed: ${result.error}`);
      return;
    }
    setSkills((prev) =>
      sortForView(prev.map((s) => (s.id === result.skill.id ? result.skill : s))),
    );
  }

  async function onDelete(skill: Skill) {
    if (!confirm(`Delete skill "${skill.name}"?`)) return;
    setBusyId(skill.id);
    const result = await deleteSkillAction(skill.id);
    setBusyId(null);
    if (!result.ok) {
      alert(`Delete failed: ${result.error}`);
      return;
    }
    setSkills((prev) => prev.filter((s) => s.id !== skill.id));
  }

  const columns: Column<Skill>[] = [
    {
      key: "name",
      header: "Name",
      width: "160px",
      render: (s) => (
        <div className="flex items-center gap-2">
          <span className="text-fg">{s.name}</span>
          {isDraft(s) && <StatusBadge tone="warn">draft</StatusBadge>}
          {refinementCritiques[s.id] && (
            <StatusBadge tone="danger">refine</StatusBadge>
          )}
          {s.source === "seeded" && (
            <StatusBadge tone="neutral">seed</StatusBadge>
          )}
          {s.source === "jarvis" && !isDraft(s) && (
            <StatusBadge tone="neutral">jarvis</StatusBadge>
          )}
        </div>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (s) => <span className="text-fg-muted">{s.description}</span>,
    },
    {
      key: "triggers",
      header: "Triggers",
      width: "240px",
      render: (s) => (
        <span className="font-mono text-[11px] text-fg-dim">
          {s.trigger_keywords.join(" · ")}
        </span>
      ),
    },
    {
      key: "active",
      header: "Active",
      width: "90px",
      align: "center",
      render: (s) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onToggleActive(s);
          }}
          disabled={busyId === s.id}
          className={[
            "rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
            s.active
              ? "border-success/40 bg-success/10 text-success"
              : "border-edge text-fg-dim hover:text-fg",
            "disabled:opacity-50",
          ].join(" ")}
        >
          {busyId === s.id ? "…" : s.active ? "on" : "off"}
        </button>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "40px",
      align: "right",
      render: (s) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onDelete(s);
          }}
          disabled={busyId === s.id}
          aria-label="Delete skill"
          title="Delete skill"
          className="rounded-sm border border-edge px-1.5 py-0.5 font-mono text-[11px] text-fg-muted hover:border-danger hover:text-danger disabled:opacity-50"
        >
          {busyId === s.id ? "…" : "×"}
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        code="SKL"
        title="Skills"
        subtitle="behavior bundles · keyword-triggered · drafts proposed by Jarvis after successful multi-tool turns"
        actions={
          <Button variant="primary" onClick={() => openCreate()}>
            + NEW SKILL
          </Button>
        }
      />

      {Object.keys(refinementCritiques).length > 0 && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/5 p-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-danger">
            // refinement needed — last 3 uses judged unhelpful
          </div>
          <ul className="flex flex-col gap-1.5 font-mono text-[11px] text-fg-muted">
            {skills
              .filter((s) => refinementCritiques[s.id])
              .map((s) => (
                <li key={s.id} className="flex gap-2">
                  <span className="text-fg">{s.name}:</span>
                  <span className="flex-1">{refinementCritiques[s.id]}</span>
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    className="rounded-sm border border-edge px-2 py-0.5 text-fg-muted hover:border-accent hover:text-accent"
                  >
                    EDIT
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-9">
          <DataTable
            columns={columns}
            rows={skills}
            rowKey={(s) => s.id}
            rowAction={(s) => openEdit(s)}
            emptyLabel="// no skills yet"
            emptyCta={
              <Button variant="primary" onClick={() => openCreate()}>
                + FIRST SKILL
              </Button>
            }
          />
        </div>

        <div className="lg:col-span-3">
          <div className="rounded-md border border-edge bg-surface/40 p-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              // quick start
            </div>
            <p className="mb-3 font-mono text-[11px] text-fg-muted">
              Click a template to pre-fill the New Skill form, then ask Jarvis
              to generate the instructions.
            </p>
            <ul className="flex flex-col gap-1.5">
              {QUICK_START_TEMPLATES.map((t) => (
                <li key={t.label}>
                  <button
                    type="button"
                    onClick={() => openCreate(t.form)}
                    className="w-full rounded-sm border border-edge px-2 py-1.5 text-left font-mono text-[11px] text-fg-muted hover:border-accent hover:text-accent"
                  >
                    + {t.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <AddItemModal
        open={editing.kind !== "closed"}
        onClose={close}
        title={editing.kind === "edit" ? "Edit Skill" : "New Skill"}
        subtitle="behavior bundle"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              CANCEL
            </Button>
            <Button variant="primary" onClick={onSave} disabled={pending}>
              {pending ? "SAVING…" : "SAVE"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Name" hint="short imperative title">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Daily Planner"
              autoFocus
            />
          </Field>

          <Field label="Description" hint="one-line summary">
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What does this skill do?"
            />
          </Field>

          <Field
            label="Trigger keywords"
            hint="comma-separated phrases; case-insensitive substring match on the user message"
          >
            <Input
              value={form.triggers}
              onChange={(e) => setForm({ ...form, triggers: e.target.value })}
              placeholder="plan my day, schedule today"
            />
          </Field>

          <Field
            label="Instructions"
            hint="markdown body addressed to Jarvis in second person"
          >
            <Textarea
              value={form.instructions}
              onChange={(e) =>
                setForm({ ...form, instructions: e.target.value })
              }
              placeholder="You are running Tyler's…"
              rows={12}
              className="font-mono text-[12px]"
            />
          </Field>

          <div className="flex justify-end">
            <Button
              variant="ghost"
              onClick={onGenerate}
              disabled={generating || pending}
            >
              {generating ? "GENERATING…" : "✦ GENERATE WITH JARVIS"}
            </Button>
          </div>

          {error && (
            <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
              ! {error}
            </div>
          )}
        </div>
      </AddItemModal>
    </>
  );
}
