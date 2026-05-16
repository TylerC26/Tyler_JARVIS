import { StatusBadge } from "@/components/ui/StatusBadge";
import type { RepoTaskStatus } from "@/lib/db/types";

const TONE: Record<RepoTaskStatus, Parameters<typeof StatusBadge>[0]["tone"]> = {
  queued: "neutral",
  claimed: "info",
  running: "accent",
  succeeded: "success",
  failed: "danger",
  cancelled: "warn",
};

export function StatusPill({ status }: { status: RepoTaskStatus }) {
  return <StatusBadge tone={TONE[status]}>{status}</StatusBadge>;
}
