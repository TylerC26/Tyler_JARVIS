// Realtime subscription + backfill + serial FIFO consumer. The daemon never
// processes more than one task at a time (concurrency = 1 by config); two
// agents on the same repo would race. Realtime delivers most tasks instantly;
// the periodic safety scan + startup backfill cover the cases where Realtime
// drops or the Mac was asleep.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RepoTask } from "../../lib/db/types";
import type { DaemonConfig } from "./config";
import { log } from "./log";
import { rescueOrphans, runCleanup, runTask } from "./runner";

const PERIODIC_SCAN_MS = 30_000;

type Job =
  | { kind: "run"; task: RepoTask }
  | { kind: "cleanup"; task: RepoTask };

class TaskQueue {
  private inFlight = false;
  // Per-(kind,id) dedupe so a row can be both run AND later cleaned up without
  // either getting suppressed as a duplicate.
  private seen = new Set<string>();

  constructor(
    private supabase: SupabaseClient,
    private cfg: DaemonConfig,
  ) {}

  enqueue(job: Job): void {
    const key = `${job.kind}:${job.task.id}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    void this.drain(job, key);
  }

  private async drain(job: Job, key: string): Promise<void> {
    while (this.inFlight) {
      await new Promise((r) => setTimeout(r, 250));
    }
    this.inFlight = true;
    try {
      log.info(`starting ${job.kind}`, { id: job.task.id, repo: job.task.repo_path });
      if (job.kind === "run") {
        await runTask(this.supabase, this.cfg, job.task);
      } else {
        await runCleanup(this.supabase, this.cfg, job.task);
      }
      log.info(`${job.kind} done`, { id: job.task.id });
    } catch (e) {
      log.error(`${job.kind} crashed`, { id: job.task.id, error: String(e) });
    } finally {
      this.inFlight = false;
      this.seen.delete(key);
    }
  }
}

export function makeSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Service-role key: the daemon is a trusted local backend (same trust tier as
  // the Next.js server) and MUST bypass RLS. repo_tasks is locked to
  // owner_id = auth.uid(), and the daemon has no Supabase Auth session, so the
  // anon key reads zero rows and every claim/status UPDATE is silently dropped.
  // Realtime postgres_changes also respects RLS, so the anon key never receives
  // task events either. The service-role key bypasses all of it.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
}

export async function start(cfg: DaemonConfig): Promise<() => Promise<void>> {
  const supabase = makeSupabase();
  const ownerId = process.env.OWNER_ID!;
  const queue = new TaskQueue(supabase, cfg);

  // 1. Rescue orphans (rows stuck in `running` from a previous crash).
  await rescueOrphans(supabase, cfg);

  // 2. Backfill any queued rows that arrived while the daemon was offline.
  const { data: backfill, error: backfillErr } = await supabase
    .from("repo_tasks")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "queued")
    .order("queued_at", { ascending: true });
  if (backfillErr) {
    log.warn("backfill query failed", { error: backfillErr.message });
  } else if (backfill && backfill.length > 0) {
    log.info(`backfill enqueueing ${backfill.length} pre-existing queued task(s)`);
    for (const row of backfill as RepoTask[]) queue.enqueue({ kind: "run", task: row });
  }

  // 2b. Backfill pending cleanup requests (Realtime UPDATE could have been
  //     missed while the daemon was down).
  const { data: cleanupBacklog } = await supabase
    .from("repo_tasks")
    .select("*")
    .eq("owner_id", ownerId)
    .not("cleanup_requested_at", "is", null)
    .is("cleanup_done_at", null);
  if (cleanupBacklog && cleanupBacklog.length > 0) {
    log.info(`backfill enqueueing ${cleanupBacklog.length} pending cleanup(s)`);
    for (const row of cleanupBacklog as RepoTask[]) queue.enqueue({ kind: "cleanup", task: row });
  }

  // 3. Realtime: react to new INSERTs (new tasks) and UPDATEs (cleanup
  //    requests stamp cleanup_requested_at) as they happen.
  const channel = supabase
    .channel("repo-tasks-queue")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "repo_tasks",
        filter: `owner_id=eq.${ownerId}`,
      },
      (payload) => {
        const row = payload.new as RepoTask;
        if (row.status !== "queued") return;
        log.debug("realtime INSERT", { id: row.id });
        queue.enqueue({ kind: "run", task: row });
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "repo_tasks",
        filter: `owner_id=eq.${ownerId}`,
      },
      (payload) => {
        const row = payload.new as RepoTask;
        const prev = payload.old as Partial<RepoTask>;
        // Detect a fresh cleanup request: cleanup_requested_at went non-null
        // AND cleanup_done_at is still null.
        if (
          row.cleanup_requested_at &&
          !row.cleanup_done_at &&
          prev.cleanup_requested_at !== row.cleanup_requested_at
        ) {
          log.debug("realtime cleanup request", { id: row.id });
          queue.enqueue({ kind: "cleanup", task: row });
        }
      },
    )
    .subscribe((status) => {
      log.info(`realtime channel: ${status}`);
    });

  // 4. Belt-and-suspenders: every 30s re-scan for queued + cleanup work.
  //    Catches Realtime drops + cases where the channel silently rebound.
  const scan = setInterval(async () => {
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const { data, error } = await supabase
      .from("repo_tasks")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("status", "queued")
      .lt("queued_at", cutoff)
      .order("queued_at", { ascending: true })
      .limit(20);
    if (error) {
      log.warn("periodic scan failed", { error: error.message });
    } else if (data && data.length > 0) {
      log.debug(`periodic scan found ${data.length} stale queued task(s)`);
      for (const row of data as RepoTask[]) queue.enqueue({ kind: "run", task: row });
    }

    // Same for stalled cleanups.
    const { data: stalledCleanups } = await supabase
      .from("repo_tasks")
      .select("*")
      .eq("owner_id", ownerId)
      .not("cleanup_requested_at", "is", null)
      .is("cleanup_done_at", null)
      .lt("cleanup_requested_at", cutoff)
      .limit(20);
    if (stalledCleanups && stalledCleanups.length > 0) {
      log.debug(`periodic scan found ${stalledCleanups.length} stalled cleanup(s)`);
      for (const row of stalledCleanups as RepoTask[]) queue.enqueue({ kind: "cleanup", task: row });
    }
  }, PERIODIC_SCAN_MS);

  // Returned shutdown handle.
  return async () => {
    clearInterval(scan);
    await supabase.removeChannel(channel);
  };
}
