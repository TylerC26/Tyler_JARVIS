"use client";

import { useEffect, useState } from "react";
import { savePromptSettingsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/settings/ThemeToggle";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PromptSettings } from "@/lib/db/types";

type Props = {
  initialSettings: PromptSettings;
  defaults: {
    orchestrator: string;
    responder: string;
    morningBrief: string;
    eveningBrief: string;
  };
};

type FieldKey =
  | "orchestrator_prompt"
  | "responder_prompt"
  | "prefix_addendum"
  | "morning_brief_prompt"
  | "evening_brief_prompt";

type FieldSpec = {
  key: FieldKey;
  label: string;
  hint: string;
  rows: number;
  hasDefault: boolean;
  defaultValue?: string;
  placeholder?: string;
};

export function SettingsView({ initialSettings, defaults }: Props) {
  const [orchestrator, setOrchestrator] = useState(
    initialSettings.orchestrator_prompt ?? "",
  );
  const [responder, setResponder] = useState(
    initialSettings.responder_prompt ?? "",
  );
  const [addendum, setAddendum] = useState(initialSettings.prefix_addendum ?? "");
  const [morningBrief, setMorningBrief] = useState(
    initialSettings.morning_brief_prompt ?? "",
  );
  const [eveningBrief, setEveningBrief] = useState(
    initialSettings.evening_brief_prompt ?? "",
  );
  const [pendingField, setPendingField] = useState<FieldKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Mirror server-fresh props back into state when the page revalidates
  // (e.g. after this page's own action fires).
  useEffect(() => {
    setOrchestrator(initialSettings.orchestrator_prompt ?? "");
    setResponder(initialSettings.responder_prompt ?? "");
    setAddendum(initialSettings.prefix_addendum ?? "");
    setMorningBrief(initialSettings.morning_brief_prompt ?? "");
    setEveningBrief(initialSettings.evening_brief_prompt ?? "");
  }, [
    initialSettings.orchestrator_prompt,
    initialSettings.responder_prompt,
    initialSettings.prefix_addendum,
    initialSettings.morning_brief_prompt,
    initialSettings.evening_brief_prompt,
  ]);

  function valueFor(key: FieldKey): string {
    if (key === "orchestrator_prompt") return orchestrator;
    if (key === "responder_prompt") return responder;
    if (key === "morning_brief_prompt") return morningBrief;
    if (key === "evening_brief_prompt") return eveningBrief;
    return addendum;
  }

  function setValueFor(key: FieldKey, v: string) {
    if (key === "orchestrator_prompt") setOrchestrator(v);
    else if (key === "responder_prompt") setResponder(v);
    else if (key === "morning_brief_prompt") setMorningBrief(v);
    else if (key === "evening_brief_prompt") setEveningBrief(v);
    else setAddendum(v);
  }

  async function save(key: FieldKey) {
    setError(null);
    setStatus(null);
    setPendingField(key);
    const result = await savePromptSettingsAction({
      [key]: valueFor(key) || null,
    });
    setPendingField(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus(`Saved ${key.replace("_", " ")}.`);
  }

  async function reset(key: FieldKey) {
    setError(null);
    setStatus(null);
    const ok = await confirmDialog(
      "Clear this override and fall back to the default?",
      { title: "reset override", confirmText: "reset" },
    );
    if (!ok) return;
    setPendingField(key);
    const result = await savePromptSettingsAction({ [key]: null });
    setPendingField(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setValueFor(key, "");
    setStatus(`Reset to default.`);
  }

  const fields: FieldSpec[] = [
    {
      key: "orchestrator_prompt",
      label: "Orchestrator (Claude) System Prompt",
      hint: "The main behavior prompt — identity, scheduling rules, tool guidance. Leave blank to use the default.",
      rows: 16,
      hasDefault: true,
      defaultValue: defaults.orchestrator,
    },
    {
      key: "responder_prompt",
      label: "Responder (DeepSeek) System Prompt",
      hint: "Used for casual/chitchat turns. Tune voice for non-data conversation. Leave blank to use the default.",
      rows: 10,
      hasDefault: true,
      defaultValue: defaults.responder,
    },
    {
      key: "prefix_addendum",
      label: "Custom Addendum (appended to every turn)",
      hint: "Free-form standing instructions, appended to the context prefix on every chat turn. Use for one-off rules like 'reply in Cantonese' or 'never suggest fast food'.",
      rows: 6,
      hasDefault: false,
      placeholder: "e.g. Always greet me by name. Avoid suggesting restaurants in Causeway Bay.",
    },
    {
      key: "morning_brief_prompt",
      label: "Morning Brief Prompt",
      hint: "System prompt used to generate the dashboard's morning brief. Leave blank for the default. Output must stay JSON-shaped: { summary, bullets: [{ label, value, severity }] }.",
      rows: 14,
      hasDefault: true,
      defaultValue: defaults.morningBrief,
    },
    {
      key: "evening_brief_prompt",
      label: "Evening Brief Prompt",
      hint: "System prompt used to generate the evening review. Same JSON shape as the morning brief.",
      rows: 10,
      hasDefault: true,
      defaultValue: defaults.eveningBrief,
    },
  ];

  return (
    <>
      <PageHeader
        code="SET"
        title="Settings"
        subtitle="prompt overrides · applied on every chat turn"
      />

      {(error || status) && (
        <div
          className={[
            "mb-4 rounded-sm border px-3 py-2 font-mono text-[11px]",
            error
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-success/40 bg-success/10 text-success",
          ].join(" ")}
        >
          {error ? `! ${error}` : `✓ ${status}`}
        </div>
      )}

      <div className="flex flex-col gap-6">
        <section className="rounded-md border border-edge bg-surface/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              Appearance
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="font-mono text-[11px] text-fg-muted">
              Interface theme · saved on this device
            </p>
            <ThemeToggle />
          </div>
        </section>
        {fields.map((f) => {
          const current = valueFor(f.key);
          const usingDefault = !current.trim();
          const initial =
            f.key === "orchestrator_prompt"
              ? initialSettings.orchestrator_prompt ?? ""
              : f.key === "responder_prompt"
                ? initialSettings.responder_prompt ?? ""
                : f.key === "morning_brief_prompt"
                  ? initialSettings.morning_brief_prompt ?? ""
                  : f.key === "evening_brief_prompt"
                    ? initialSettings.evening_brief_prompt ?? ""
                    : initialSettings.prefix_addendum ?? "";
          const dirty = current !== initial;

          return (
            <section
              key={f.key}
              className="rounded-md border border-edge bg-surface/40 p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
                    {f.label}
                  </span>
                  {f.hasDefault &&
                    (usingDefault ? (
                      <StatusBadge tone="neutral">default</StatusBadge>
                    ) : (
                      <StatusBadge tone="accent">override</StatusBadge>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                  {f.hasDefault && (
                    <Button
                      variant="ghost"
                      onClick={() => reset(f.key)}
                      disabled={pendingField === f.key}
                    >
                      RESET
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    onClick={() => save(f.key)}
                    disabled={pendingField === f.key || !dirty}
                  >
                    {pendingField === f.key ? "SAVING…" : "SAVE"}
                  </Button>
                </div>
              </div>

              <Field label="" hint={f.hint}>
                <Textarea
                  value={current}
                  onChange={(e) => setValueFor(f.key, e.target.value)}
                  rows={f.rows}
                  placeholder={f.placeholder}
                  className="font-mono text-[12px]"
                />
              </Field>

              {f.hasDefault && f.defaultValue && (
                <details className="mt-3">
                  <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:text-fg-muted">
                    view default
                  </summary>
                  <pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-sm border border-edge bg-surface-2/40 p-3 font-mono text-[11px] text-fg-muted">
                    {f.defaultValue}
                  </pre>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
