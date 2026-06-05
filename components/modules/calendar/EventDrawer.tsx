"use client";

import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { AddItemModal } from "@/components/ui/AddItemModal";
import type { Event } from "@/lib/db/types";
import { EventForm, type EventFormValues } from "./EventForm";

type Mode = "create" | "edit";

// Claudia, the work-assistant agent, owns meeting-note capture. Work events
// deep-link straight into her thread.
const CLAUDIA_SLUG = "work-assistant";

type Props = {
  open: boolean;
  mode: Mode;
  initial: Partial<Event> & { starts_at: string; ends_at: string };
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (values: EventFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export function EventDrawer({
  open,
  mode,
  initial,
  pending,
  error,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const formId = "event-form";
  const router = useRouter();

  useEffect(() => {
    // No-op: AddItemModal handles ESC + body lock
  }, [open]);

  // Only existing work events get the "take notes" affordance — it deep-links
  // into Claudia's (work-assistant) thread with a seeded kick-off message.
  const isWorkEvent = mode === "edit" && initial.category === "work";

  function startNotes() {
    const title = initial.title?.trim() || "this event";
    let when = "";
    try {
      when = format(new Date(initial.starts_at), "EEE MMM d · h:mma");
    } catch {
      when = "";
    }
    const prompt =
      `Let's take notes for my work event "${title}"` +
      (when ? ` (${when})` : "") +
      ". Capture the key points, decisions, and action items as I share them, " +
      "and keep a running summary I can review afterward.";
    router.push(
      `/chat?agent=${CLAUDIA_SLUG}&prompt=${encodeURIComponent(prompt)}`,
    );
  }

  return (
    <AddItemModal
      open={open}
      onClose={onClose}
      wide
      title={mode === "create" ? "New Event" : "Edit Event"}
      subtitle={mode === "create" ? "schedule" : "modify"}
      footer={
        <>
          {mode === "edit" && onDelete && (
            <Button variant="danger" onClick={() => void onDelete()} disabled={pending}>
              ✕ DELETE
            </Button>
          )}
          {isWorkEvent && (
            <Button variant="primary" onClick={startNotes} disabled={pending}>
              📝 TAKE NOTES
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            CANCEL
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            disabled={pending}
          >
            {pending ? "SAVING…" : "SAVE"}
          </Button>
        </>
      }
    >
      <EventForm initial={initial} formId={formId} onSubmit={onSave} />
      {error && (
        <div className="mt-4 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">
          ! {error}
        </div>
      )}
    </AddItemModal>
  );
}
