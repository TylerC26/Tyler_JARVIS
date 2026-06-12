// Step-1 ACL mirror tests: every body_metrics / progress_photos DAL call must
// scope by the active owner's user_id, and signed URLs must be mintable only
// for paths the active owner owns. (The DB side — RLS + FORCE — lives in
// migration 0053 and can't run under vitest; these tests pin the app-side
// mirror so a refactor can't quietly drop the scoping.)

import { beforeEach, describe, expect, test, vi } from "vitest";

const OWNER = "00000000-0000-0000-0000-000000000001";
const INTRUDER = "99999999-9999-9999-9999-999999999999";

// Chainable query recorder standing in for the supabase client.
type Call = { method: string; args: unknown[] };

function makeRecorder(resultRows: unknown[] = []) {
  const calls: Call[] = [];
  const signCalls: Call[] = [];
  const builder: Record<string, unknown> = {};
  const chain =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  for (const m of ["select", "insert", "update", "delete", "eq", "gte", "lt", "is", "order", "limit"]) {
    builder[m] = chain(m);
  }
  builder.single = async () => ({ data: resultRows[0] ?? null, error: null });
  builder.maybeSingle = async () => ({ data: resultRows[0] ?? null, error: null });
  // awaiting the bare builder (list queries) resolves rows
  builder.then = (resolve: (v: unknown) => void) =>
    resolve({ data: resultRows, error: null });

  const client = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return builder;
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (...args: unknown[]) => {
          signCalls.push({ method: `sign:${bucket}`, args });
          return { data: { signedUrl: "https://signed.example/x" }, error: null };
        },
        upload: async () => ({ error: null }),
      }),
    },
  };
  return { client, calls, signCalls };
}

const state: { recorder: ReturnType<typeof makeRecorder> } = {
  recorder: makeRecorder(),
};

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: async () => state.recorder.client,
}));

import {
  insertBodyMetric,
  latestBodyMetric,
  listBodyMetrics,
} from "./body-metrics";
import {
  attachAnalysis,
  getPhotoWithPriorForCompare,
  insertProgressPhoto,
  listProgressPhotos,
} from "./progress-photos";
import { signProgressPhotoUrl } from "@/lib/storage/progress-photos";

function userIdFilters(calls: Call[]): unknown[] {
  return calls
    .filter((c) => c.method === "eq" && c.args[0] === "user_id")
    .map((c) => c.args[1]);
}
function insertedUserIds(calls: Call[]): unknown[] {
  return calls
    .filter((c) => c.method === "insert")
    .map((c) => (c.args[0] as { user_id?: string }).user_id);
}

beforeEach(() => {
  state.recorder = makeRecorder();
});

describe("body_metrics DAL is owner-scoped", () => {
  test("reads filter on the active owner's user_id", async () => {
    await listBodyMetrics({ since: "2026-01-01" });
    await latestBodyMetric();
    const filters = userIdFilters(state.recorder.calls);
    expect(filters.length).toBeGreaterThanOrEqual(2);
    expect(filters.every((v) => v === OWNER)).toBe(true);
  });

  test("inserts stamp the active owner's user_id", async () => {
    state.recorder = makeRecorder([{ id: "m1", user_id: OWNER }]);
    await insertBodyMetric({ weight_kg: 84 });
    expect(insertedUserIds(state.recorder.calls)).toEqual([OWNER]);
  });
});

describe("progress_photos DAL is owner-scoped", () => {
  test("every read and write filters or stamps user_id = owner", async () => {
    state.recorder = makeRecorder([
      { id: "p1", user_id: OWNER, taken_at: "2026-06-01T00:00:00Z" },
    ]);
    await listProgressPhotos({ limit: 5 });
    await getPhotoWithPriorForCompare("p1");
    await attachAnalysis("p1", { note: "x" });
    await insertProgressPhoto({ storage_path: `${OWNER}/a.jpg` });

    const filters = userIdFilters(state.recorder.calls);
    expect(filters.length).toBeGreaterThanOrEqual(4);
    expect(filters.every((v) => v === OWNER)).toBe(true);
    expect(insertedUserIds(state.recorder.calls)).toEqual([OWNER]);
  });
});

describe("signed URLs are owner-gated", () => {
  test("signs paths under the active owner's folder", async () => {
    const url = await signProgressPhotoUrl(`${OWNER}/2026-06-12-abc.jpg`);
    expect(url).toBe("https://signed.example/x");
    expect(state.recorder.signCalls).toHaveLength(1);
  });

  test("refuses to sign another user's path — storage is never asked", async () => {
    const url = await signProgressPhotoUrl(`${INTRUDER}/2026-06-12-abc.jpg`);
    expect(url).toBeNull();
    expect(state.recorder.signCalls).toHaveLength(0);
  });

  test("refuses traversal-ish paths that merely embed the owner id", async () => {
    const url = await signProgressPhotoUrl(`${INTRUDER}/${OWNER}/x.jpg`);
    expect(url).toBeNull();
    expect(state.recorder.signCalls).toHaveLength(0);
  });
});
