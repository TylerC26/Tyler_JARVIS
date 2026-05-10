"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { AddItemModal } from "@/components/ui/AddItemModal";
import { PageHeader } from "@/components/ui/PageHeader";
import { createHabit } from "@/lib/db/actions/habits";
import type { HabitWithToday } from "@/lib/db/types";
import { HabitRow } from "./HabitRow";

export function HabitsView({ habits }: { habits: HabitWithToday[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await createHabit(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    formRef.current?.reset();
    setOpen(false);
  }

  const todayCount = habits.filter((h) => h.logged_today).length;
  const total = habits.length;
  const pct = total === 0 ? 0 : Math.round((todayCount / total) * 100);

  return (
    <>
      <PageHeader
        code="HBT"
        title="Habits"
        subtitle={`${todayCount}/${total} completed today · ${pct}%`}
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            + NEW HABIT
          </Button>
        }
      />

      {habits.length === 0 ? (
        <div className="rounded-md border border-dashed border-edge bg-surface/50 px-6 py-16 text-center">
          <p className="font-mono text-xs text-fg-dim">
            // no habits tracked — define your first ritual
          </p>
          <div className="mt-4">
            <Button variant="primary" onClick={() => setOpen(true)}>
              + NEW HABIT
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {habits.map((h) => (
            <HabitRow key={h.id} habit={h} />
          ))}
        </div>
      )}

      <AddItemModal
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="New Habit"
        subtitle="define ritual"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              CANCEL
            </Button>
            <Button
              variant="primary"
              onClick={() => formRef.current?.requestSubmit()}
              disabled={pending}
            >
              {pending ? "SAVING…" : "SAVE"}
            </Button>
          </>
        }
      >
        <form
          ref={formRef}
          action={onSubmit}
          className="flex flex-col gap-4"
        >
          <Field label="Name">
            <Input
              name="name"
              placeholder="e.g. Read 30 minutes"
              autoFocus
              required
            />
          </Field>
          <Field label="Cadence">
            <Select name="cadence" defaultValue="daily">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </Select>
          </Field>
          <Field label="Color (optional)">
            <Input name="color" placeholder="cyan, amber, green" />
          </Field>
          {error && (
            <div className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
              ! {error}
            </div>
          )}
        </form>
      </AddItemModal>
    </>
  );
}
