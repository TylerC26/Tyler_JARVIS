"use client";

import { useState } from "react";
import {
  createCronJobAction,
  deleteCronJobAction,
  toggleCronJobAction,
} from "@/app/(app)/cron/actions";
import { Button } from "@/components/ui/Button";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import type { CronJob } from "@/lib/db/types";

type Props = { initialJobs: CronJob[] };

// Natural-language starting points — these seed the prompt box, then Opus
// turns them into the structured schedule/prompt/name fields.
const EXAMPLE_PROMPTS = [
  "Every morning at 8, send me a brief of today's tasks and calendar",
  "Monday at 9am, summarize my open tasks and this week's events",
  "Every day at noon, remind me to drink water and take a break",
];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function CronView({ initialJobs }: Props) {
  const [jobs, setJobs] = useState<CronJob[]>(initialJobs);
  const [showForm, setShowForm] = useState(false);
  const [nlPrompt, setNlPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", schedule: "", prompt: "" });
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setShowForm(false);
    setNlPrompt("");
    setHasDraft(false);
    setForm({ name: "", description: "", schedule: "", prompt: "" });
    setError(null);
  }

  async function handleGenerate() {
    const request = nlPrompt.trim();
    if (!request) return;
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/cron/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Couldn't generate the automation.");
        return;
      }
      setForm({
        name: data.name ?? "",
        schedule: data.schedule ?? "",
        prompt: data.prompt ?? "",
        description: data.description ?? "",
      });
      setHasDraft(true);
      setError(
        data.scheduleValid === false
          ? "Opus produced an unusual schedule — double-check the cron expression below before scheduling."
          : null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate the automation.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const result = await createCronJobAction({
      name: form.name,
      description: form.description || undefined,
      schedule: form.schedule,
      prompt: form.prompt,
    });
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    setJobs((prev) => [...prev, result.data]);
    resetForm();
  }

  async function handleToggle(job: CronJob) {
    const result = await toggleCronJobAction(job.id, !job.active);
    if (result.ok) {
      setJobs((prev) => prev.map((j) => j.id === job.id ? result.data : j));
    }
  }

  async function handleDelete(job: CronJob) {
    const ok = await confirmDialog(`Delete "${job.name}"?`, {
      title: "delete cron job",
      confirmText: "delete",
    });
    if (!ok) return;
    const result = await deleteCronJobAction(job.id);
    if (result.ok) setJobs((prev) => prev.filter((j) => j.id !== job.id));
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        code="CRN"
        title="Cron Jobs"
        subtitle={`${jobs.length} automation${jobs.length !== 1 ? "s" : ""} scheduled`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => (showForm ? resetForm() : setShowForm(true))}
          >
            {showForm ? "cancel" : "+ new"}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4">
        {/* Create flow: describe in plain language → Opus drafts → review → schedule */}
        {showForm && (
          <div className="rounded-sm border border-accent/30 bg-surface-2/60 p-4 space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
              // describe your automation
            </p>

            {/* Example prompts — seed the box, then generate */}
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setNlPrompt(ex)}
                  className="rounded-sm border border-edge bg-surface px-2 py-0.5 font-mono text-[10px] text-fg-muted hover:text-fg hover:border-edge-strong transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>

            <Field label="What should this automation do?">
              <Textarea
                placeholder="Every morning at 8, send me a brief of today's tasks and calendar"
                value={nlPrompt}
                onChange={(e) => setNlPrompt(e.target.value)}
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void handleGenerate();
                  }
                }}
              />
            </Field>

            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-fg-dim">
                ⌘↵ to generate
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleGenerate()}
                disabled={generating || !nlPrompt.trim()}
              >
                {generating ? "generating…" : hasDraft ? "✦ regenerate" : "✦ generate with opus"}
              </Button>
            </div>

            {/* Generated draft — editable review before scheduling */}
            {hasDraft && (
              <form
                onSubmit={handleCreate}
                className="border-t border-edge pt-3 space-y-3"
              >
                <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
                  // review &amp; schedule
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Name">
                    <Input
                      placeholder="Morning Brief"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="Schedule (UTC cron)">
                    <Input
                      placeholder="0 8 * * *"
                      value={form.schedule}
                      onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value }))}
                      required
                      className="font-mono"
                    />
                  </Field>
                </div>
                <Field label="Prompt">
                  <Textarea
                    placeholder="Generate my morning brief"
                    value={form.prompt}
                    onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                    required
                    rows={2}
                  />
                </Field>
                <Field label="Description (optional)">
                  <Input
                    placeholder="Runs every day at 8am UTC"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </Field>

                <div className="flex justify-end">
                  <Button type="submit" variant="primary" size="sm" disabled={saving}>
                    {saving ? "saving…" : "schedule"}
                  </Button>
                </div>
              </form>
            )}

            {error && (
              <p className="font-mono text-[11px] text-danger">{error}</p>
            )}
          </div>
        )}

        {/* Job list */}
        {jobs.length === 0 && !showForm ? (
          <div className="grid place-items-center h-48">
            <p className="font-mono text-sm text-fg-dim">no automations yet — click + new to create one.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className={[
                  "rounded-sm border px-4 py-3 flex flex-col gap-2 transition-colors",
                  job.active ? "border-edge bg-surface-2/40" : "border-edge/50 bg-surface/30 opacity-60",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-fg">{job.name}</span>
                      <code className="font-mono text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-sm">
                        {job.schedule}
                      </code>
                      {!job.active && (
                        <span className="font-mono text-[10px] text-fg-dim border border-edge px-1.5 rounded-sm">
                          paused
                        </span>
                      )}
                    </div>
                    {job.description && (
                      <p className="font-mono text-[11px] text-fg-dim mt-0.5">{job.description}</p>
                    )}
                    <p className="font-mono text-[11px] text-fg-muted mt-1 line-clamp-2">
                      <span className="text-fg-dim">›</span> {job.prompt}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => handleToggle(job)}>
                      {job.active ? "pause" : "enable"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handleDelete(job)}>
                      del
                    </Button>
                  </div>
                </div>
                <div className="flex gap-4 font-mono text-[10px] text-fg-dim">
                  <span>last run: {fmtDate(job.last_run_at)}</span>
                  <span>next: {fmtDate(job.next_run_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
