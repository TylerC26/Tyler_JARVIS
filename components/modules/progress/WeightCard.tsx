"use client";

// Top-of-page weight tracker for /progress. Shows current weight + 7-day and
// 28-day trailing averages (computed server-side), a collapsible quick-log so
// a weigh-in can be added from the web (otherwise weight only arrives via
// chat/Telegram), and a collapsible list of recent weigh-ins each with a
// delete control for clearing a bad reading. Mutations call server actions
// then router.refresh() so the averages recompute from the source of truth.
//
// Trend framing matches the rest of the page: deltas vs the 7-day average,
// neutral arrows, no good/bad verdict on direction.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import {
  deleteBodyMetricAction,
  logBodyWeightAction,
} from "@/app/(app)/progress/actions";

export type WeightEntry = {
  id: string;
  weight_kg: number;
  bf_percent: number | null;
  recorded_at: string;
};

type Props = {
  latestKg: number | null;
  latestAt: string | null;
  avg7: number | null;
  avg28: number | null;
  entries: WeightEntry[];
  tz: string;
};

function fmtDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
        {label}
      </span>
      <span className="font-mono text-lg font-semibold text-fg">{value}</span>
    </div>
  );
}

export function WeightCard({
  latestKg,
  latestAt,
  avg7,
  avg28,
  entries,
  tz,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showLog, setShowLog] = useState(false);
  const [showEntries, setShowEntries] = useState(false);
  const [weight, setWeight] = useState("");
  const [bf, setBf] = useState("");

  // Latest reading relative to the 7-day average — the honest "trending up or
  // down" read, not a single-day verdict.
  const trend =
    latestKg != null && avg7 != null
      ? Math.round((latestKg - avg7) * 100) / 100
      : null;

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    const kg = Number(weight);
    if (!Number.isFinite(kg) || kg <= 0) {
      await alertDialog("Enter a weight in kg (a positive number).", {
        title: "invalid weight",
      });
      return;
    }
    const bfNum = bf.trim() ? Number(bf) : null;
    if (bfNum != null && (!Number.isFinite(bfNum) || bfNum < 0 || bfNum > 100)) {
      await alertDialog("Body-fat % must be between 0 and 100.", {
        title: "invalid bf%",
      });
      return;
    }
    const result = await logBodyWeightAction({
      weight_kg: kg,
      bf_percent: bfNum,
    });
    if (!result.ok) {
      await alertDialog(result.error, { title: "log failed" });
      return;
    }
    setWeight("");
    setBf("");
    setShowLog(false);
    startTransition(() => router.refresh());
  }

  async function handleDelete(entry: WeightEntry) {
    const ok = await confirmDialog(
      `Delete the ${entry.weight_kg} kg weigh-in from ${fmtDay(entry.recorded_at, tz)}?`,
      { title: "delete weigh-in", confirmText: "delete" },
    );
    if (!ok) return;
    const result = await deleteBodyMetricAction(entry.id);
    if (!result.ok) {
      await alertDialog(result.error, { title: "delete failed" });
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <section className="mb-4 rounded-sm border border-edge bg-surface-2/40 p-4">
      <div className="flex items-center justify-between gap-3 border-b border-edge/40 pb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
          // weight
        </span>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowEntries((v) => !v)}
            >
              {showEntries ? "hide log" : `log (${entries.length})`}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowLog((v) => !v)}
          >
            {showLog ? "cancel" : "+ weigh-in"}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-10 gap-y-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
            current
          </span>
          <span className="font-mono text-3xl font-semibold text-fg">
            {latestKg != null ? `${latestKg}` : "—"}
            <span className="ml-1 text-sm font-normal text-fg-dim">kg</span>
          </span>
          {latestAt && (
            <span className="font-mono text-[10px] text-fg-dim">
              {fmtDay(latestAt, tz)}
            </span>
          )}
        </div>
        <Stat label="7-day avg" value={avg7 != null ? `${avg7} kg` : "—"} />
        <Stat label="28-day avg" value={avg28 != null ? `${avg28} kg` : "—"} />
        {trend != null && (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
              vs 7-day avg
            </span>
            <span className="font-mono text-sm text-fg-muted">
              {trend === 0
                ? "level"
                : `${trend > 0 ? "▲" : "▼"} ${Math.abs(trend)} kg`}
            </span>
          </div>
        )}
      </div>

      {showLog && (
        <form
          onSubmit={handleLog}
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-edge/40 pt-3"
        >
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
              weight (kg)
            </span>
            <Input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              inputMode="decimal"
              placeholder="74.2"
              autoFocus
              className="h-9 w-28"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
              body-fat % (optional)
            </span>
            <Input
              value={bf}
              onChange={(e) => setBf(e.target.value)}
              inputMode="decimal"
              placeholder="—"
              className="h-9 w-28"
            />
          </div>
          <Button type="submit" size="md" variant="primary" disabled={pending}>
            {pending ? "saving…" : "log"}
          </Button>
        </form>
      )}

      {showEntries && entries.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-edge/40 border-t border-edge/40">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 py-1.5 font-mono text-xs"
            >
              <span className="text-fg-muted">{fmtDay(entry.recorded_at, tz)}</span>
              <div className="flex items-center gap-3">
                <span className="text-fg">
                  {entry.weight_kg} kg
                  {entry.bf_percent != null && (
                    <span className="ml-2 text-fg-dim">{entry.bf_percent}% bf</span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(entry)}
                  disabled={pending}
                  aria-label="delete weigh-in"
                  title="delete weigh-in"
                  className="!h-6 !px-1.5 text-fg-dim hover:text-danger"
                >
                  ✕
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
