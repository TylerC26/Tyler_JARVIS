// log_workout — structured strength logging into gym_sessions + gym_exercise_logs
// (migration 0058) via the DAL. Built for Matt (the personal-trainer agent):
// his session notes previously captured lifts as free text, which couldn't drive
// the /gym progression charts. This tool turns "bench 100kg 8/8/6" into queryable
// sets so /gym can render per-exercise progression + the attendance heat map.
// The orchestrator gets it too via ALL_TOOLS. Pairs with log_body_weight, which
// stays the home for BODYWEIGHT (this tool is for the loads Tyler lifts).

import { tool } from "ai";
import { z } from "zod";
import { createWorkoutCore } from "@/lib/db/core/gym";

export const logWorkoutInput = z.object({
  title: z
    .string()
    .optional()
    .describe(
      "Optional short label for the session, e.g. 'Push day', 'Legs', 'Upper A'. Omit if Tyler didn't name it.",
    ),
  performed_at: z
    .string()
    .optional()
    .describe(
      "ISO 8601 timestamp WITH Tyler's local offset (e.g. 2026-06-25T18:00:00+08:00) — never trailing Z. Defaults to now; only set it when he's backdating ('yesterday I benched…').",
    ),
  notes: z
    .string()
    .optional()
    .describe("Optional session notes — how it felt, injuries, deload, etc."),
  exercises: z
    .array(
      z.object({
        name: z
          .string()
          .describe("Exercise display name, e.g. 'Bench Press', 'Back Squat'."),
        sets: z
          .array(
            z.object({
              reps: z.number().int().min(0).describe("Reps performed in the set."),
              weight: z
                .number()
                .min(0)
                .describe(
                  "Load exactly as Tyler said it, in `unit`. Do NOT convert — the tool normalizes lb→kg. Use 0 for bodyweight-only movements.",
                ),
              unit: z
                .enum(["kg", "lb"])
                .optional()
                .describe("Unit of `weight`. Defaults to kg. Infer from how Tyler reported it."),
              rpe: z
                .number()
                .min(1)
                .max(10)
                .optional()
                .describe("Rate of perceived exertion (1–10), only if he mentioned it."),
              warmup: z
                .boolean()
                .optional()
                .describe("True for warm-up sets — excluded from top-set / PR / volume math."),
            }),
          )
          .min(1)
          .describe(
            "One entry per set. Expand shorthand: '100kg 8/8/6' = three sets of 100kg at 8, 8, 6 reps.",
          ),
      }),
    )
    .min(1)
    .describe("Every exercise Tyler trained this session, each with its sets."),
});

export const logWorkoutTool = tool({
  description:
    "Log a completed GYM/STRENGTH session as structured sets (exercise → reps × weight) into Tyler's training log. Use WHENEVER he reports training lifts: 'bench 100kg 8/8/6, OHP 60kg 3x10', 'just did legs: squat 140x5x3, RDL 100x8', 'logged my push day'. This powers the /gym progression charts + attendance heat map, so always call it when he describes what he lifted — then acknowledge naturally in chat. Pass loads exactly as he said them with the right unit; the tool converts lb→kg and computes top set, est. 1RM, and volume. NOT for bodyweight weigh-ins (use log_body_weight) — though it's fine to call both when he opens a session with his weight.",
  inputSchema: logWorkoutInput,
  execute: async (input) => {
    const result = await createWorkoutCore({
      title: input.title ?? null,
      performed_at: input.performed_at,
      notes: input.notes ?? null,
      source: "matt",
      exercises: input.exercises.map((e) => ({
        name: e.name,
        sets: e.sets.map((s) => ({
          reps: s.reps,
          weight: s.weight,
          unit: s.unit ?? "kg",
          rpe: s.rpe ?? null,
          warmup: s.warmup ?? false,
        })),
      })),
    });

    if (!result.ok) return { ok: false, error: result.error };

    const session = result.data;
    const topLine = session.exercises
      .map((ex) =>
        ex.top_weight_kg != null
          ? `${ex.exercise} ${ex.top_weight_kg}kg`
          : ex.exercise,
      )
      .join(" · ");

    return {
      ok: true,
      session_id: session.id,
      message: `Logged ${session.exercises.length} exercise${
        session.exercises.length === 1 ? "" : "s"
      }${session.title ? ` · ${session.title}` : ""} — ${topLine}`,
      summary: {
        title: session.title,
        performed_at: session.performed_at,
        exercises: session.exercises.map((ex) => ({
          exercise: ex.exercise,
          top_weight_kg: ex.top_weight_kg,
          est_1rm_kg: ex.est_1rm_kg,
          total_volume_kg: ex.total_volume_kg,
          sets: ex.sets.length,
        })),
      },
    };
  },
});
