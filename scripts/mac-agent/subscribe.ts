// Realtime subscription + backfill + serial FIFO consumer. The daemon never
// processes more than one task at a time (concurrency = 1 by config); two
// agents on the same repo would race. Realtime delivers most tasks instantly;
// the periodic safety scan + startup backfill cover the cases where Realtime
// drops or the Mac was asleep.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RepoTask } from "../../lib/db/types";
import type { DaemonConfig } from "./config";
import { log } from "./log";
import { rescueOrphans, runTask } from "./runner";

const PERIODIC_SCAN_MS = 30_000;

class TaskQueue {
  private inFlight = false;
  private seen = new Set<string>();

  constructor(
    private supabase: SupabaseClient,
    private cfg: DaemonConfig,
  ) {}

  enqueue(task: RepoTask): void {
    if (this.seen.has(task.id)) return;
    this.seen.add(task.id);
    void this.drain(task);
  }

  private async drain(task: RepoTask): Promise<void> {
    // If something is in flight, just wait — this task will be picked up by the
    // next backfill scan in serial order. Simpler than maintaining an array.
    while (this.inFlight) {
      await new Promise((r) => setTimeout(r, 250));
    }
    this.inFlight = true;
    try {
      log.info("starting task", { id: task.id, repo: task.repo_path });
      await runTask(this.supabase, this.cfg, task);
      log.info("task done", { id: task.id });
    } catch (e) {
      log.error("task crashed", { id: task.id, error: String(e) });
    } finally {
      this.inFlight = false;
      // Forget after completion so a row that gets re-queued (manual SQL,
      // future cancel/retry) can run again.
      this.seen.delete(task.id);
    }
  }
}

export function makeSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
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
    for (const row of backfill as RepoTask[]) queue.enqueue(row);
  }

  // 3. Realtime: react to new INSERTs as they happen.
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
        queue.enqueue(row);
      },
    )
    .subscribe((status) => {
      log.info(`realtime channel: ${status}`);
    });

  // 4. Belt-and-suspenders: every 30s re-scan for queued rows older than 60s.
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
      return;
    }
    if (!data || data.length === 0) return;
    log.debug(`periodic scan found ${data.length} stale queued task(s)`);
    for (const row of data as RepoTask[]) queue.enqueue(row);
  }, PERIODIC_SCAN_MS);

  // Returned shutdown handle.
  return async () => {
    clearInterval(scan);
    await supabase.removeChannel(channel);
  };
}
