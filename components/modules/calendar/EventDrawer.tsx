"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { AddItemModal } from "@/components/ui/AddItemModal";
import type { Event } from "@/lib/db/types";
import { EventForm, type EventFormValues } from "./EventForm";

type Mode = "create" | "edit";

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

  useEffect(() => {
    // No-op: AddItemModal handles ESC + body lock
  }, [open]);

  return (
    <AddItemModal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "New Event" : "Edit Event"}
      subtitle={mode === "create" ? "schedule" : "modify"}
      footer={
        <>
          {mode === "edit" && onDelete && (
            <Button variant="danger" onClick={() => void onDelete()} disabled={pending}>
              ✕ DELETE
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
