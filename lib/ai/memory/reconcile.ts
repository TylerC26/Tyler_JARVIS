// Post-turn memory reconciliation. Runs fire-and-forget after every chat turn:
// it reads Tyler's current memory store, looks at the latest turn, and decides
// what to change — create new durable facts, refine existing ones, or
// supersede ones that turned out wrong. Unlike the old extractor it never
// blindly inserts; it sees the existing store and emits targeted operations,
// so duplicates and stale contradictions don't accumulate.
//
// Runs on Claude Haiku 4.5 — the cheapest tier, sufficient for this
// structured-output classification.

import { generateObject } from "ai";
import { z } from "zod";
import { modelForFeature } from "@/lib/ai/model-prefs";
import { recordModelUsage } from "@/lib/chat/router";
import { isMinimaxEnabled } from "@/lib/db/core/site-settings";
import {
  createMemoryCore,
  listMemoriesCore,
  supersedeMemoryCore,
  updateMemoryCore,
} from "@/lib/db/core/memory";
import { MEMORY_KINDS } from "@/lib/db/types";

// Turns shorter than this carry nothing worth reconciling.
const MIN_USER_TEXT = 12;
// Reconciliation only shows the model this many existing memories (newest
// first). The store would have to grow large before older entries fall out of
// view — and they're still reachable, just not in this pass's context.
const MAX_EXISTING_IN_CONTEXT = 80;

const KindEnum = z.enum(MEMORY_KINDS);
const ConfidenceEnum = z.enum(["high", "medium", "low"]);

const OperationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    kind: KindEnum,
    key: z.string().min(2).max(60),
    value: z.string().min(2).max(280),
    confidence: ConfidenceEnum,
  }),
  z.object({
    action: z.literal("update"),
    id: z.string(),
    key: z.string().min(2).max(60).optional(),
    value: z.string().min(2).max(280).optional(),
    kind: KindEnum.optional(),
    confidence: ConfidenceEnum.optional(),
  }),
  z.object({
    action: z.literal("supersede"),
    id: z.string(),
    kind: KindEnum,
    key: z.string().min(2).max(60),
    value: z.string().min(2).max(280),
    confidence: ConfidenceEnum,
  }),
]);

const ReconcileSchema = z.object({
  operations: z.array(OperationSchema).max(6),
});

const SYSTEM_PROMPT = `You are the long-term memory curator for Tyler's personal assistant, Jarvis.

You are given Tyler's CURRENT MEMORY STORE and the LATEST conversation turn. Decide what — if anything — should change, and emit a list of operations. Emit an empty list when nothing durable was disclosed. Most turns produce zero operations.

What belongs in memory: stable facts and preferences about Tyler — who he is, the people in his life, his health, how he works, his routines, his standing goals. What does NOT: today's tasks, calendar entries, his current mood, one-off questions, facts about the wider world, or anything already captured.

Operations:
- create — a NEW durable fact not already in the store.
- update — an existing entry is incomplete or slightly off; refine it (pass its id). Use this to ENRICH, not to contradict.
- supersede — an existing entry is now WRONG and the turn gives the correct version (pass the OLD id). The old entry is retired and replaced by the values you give.

Rules:
- Before you create, scan the store. If the fact is already there, do nothing — never duplicate.
- Prefer update / supersede over create whenever the turn touches an existing entry.
- key: 2-6 words, lowercase, dictionary-style label. value: one concrete declarative sentence.
- kind: identity (who he is), preference (how he likes things), relationship (a person in his life), health, work, routine (recurring habit/schedule), goal (a standing objective), knowledge (other durable fact), context (situational background).
- confidence: high when Tyler stated it plainly, medium when reasonably inferred, low when uncertain.
- Be conservative. Quality over volume.`;

export type ReconcileResult = {
  created: number;
  updated: number;
  superseded: number;
};

// Read the store, ask Haiku what to change, apply the operations. Fully
// self-contained — the caller just fires it after a turn. Never throws.
export async function reconcileMemoriesFromTurn(
  userMsg: string,
  assistantMsg: string,
): Promise<ReconcileResult> {
  const empty: ReconcileResult = { created: 0, updated: 0, superseded: 0 };
  if (!userMsg || userMsg.trim().length < MIN_USER_TEXT) return empty;
  if (!(await isMinimaxEnabled())) return empty;

  const existing = (
    await listMemoriesCore({ scope: "global", statuses: ["active"] })
  ).slice(0, MAX_EXISTING_IN_CONTEXT);

  const memoryList =
    existing.length === 0
      ? "(empty — no memories stored yet)"
      : existing
          .map((m) => `[id:${m.id}] (${m.kind}) ${m.key}: ${m.value}`)
          .join("\n");

  try {
    const { model, modelId } = await modelForFeature("memory");
    const result = await generateObject({
      model,
      schema: ReconcileSchema,
      system: SYSTEM_PROMPT,
      prompt: `CURRENT MEMORY STORE:\n${memoryList}\n\n---\n\nLATEST TURN:\nUser: ${userMsg.trim()}\n\nAssistant: ${assistantMsg.trim()}`,
      maxOutputTokens: 700,
    });
    recordModelUsage(modelId, "classifier", result.usage);

    // Only act on ids the model was actually shown — guards against
    // hallucinated update/supersede targets.
    const validIds = new Set(existing.map((m) => m.id));
    const out: ReconcileResult = { ...empty };

    for (const op of result.object.operations) {
      if (op.action === "create") {
        const r = await createMemoryCore({
          scope: "global",
          source: "extracted",
          kind: op.kind,
          key: op.key,
          value: op.value,
          confidence: op.confidence,
        });
        if (r.ok) out.created++;
      } else if (op.action === "update") {
        if (!validIds.has(op.id)) continue;
        const r = await updateMemoryCore(op.id, {
          ...(op.key !== undefined ? { key: op.key } : {}),
          ...(op.value !== undefined ? { value: op.value } : {}),
          ...(op.kind !== undefined ? { kind: op.kind } : {}),
          ...(op.confidence !== undefined
            ? { confidence: op.confidence }
            : {}),
        });
        if (r.ok) out.updated++;
      } else {
        if (!validIds.has(op.id)) continue;
        const r = await supersedeMemoryCore(op.id, {
          scope: "global",
          source: "extracted",
          kind: op.kind,
          key: op.key,
          value: op.value,
          confidence: op.confidence,
        });
        if (r.ok) out.superseded++;
      }
    }
    return out;
  } catch (e) {
    console.warn("[memory] reconciliation failed:", e);
    return empty;
  }
}
