import { addDays, format, parseISO } from "date-fns";
import { todayISO } from "@/lib/date";
import { getOwnerId } from "@/lib/auth/currentUser";
import { getSupabaseServer } from "@/lib/supabase/server";
import type {
  AiBrief,
  AiBriefBullet,
  AiBriefKind,
  AiSuggestion,
  AiSuggestionStatus,
} from "@/lib/db/types";
import type { AIContext, BriefDraft, SuggestionDraft } from "./types";

export async function saveBrief(
  draft: BriefDraft,
  ctx: AIContext,
  kind: AiBriefKind,
  engineName: string,
): Promise<AiBrief | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("ai_briefs")
    .insert({
      owner_id: getOwnerId(),
      kind,
      for_date: ctx.forDate,
      engine: engineName,
      summary: draft.summary,
      bullets: draft.bullets,
      context_snapshot: ctx as unknown as Record<string, unknown>,
    })
    .select()
    .single();

  if (error) {
    console.error("[ai] saveBrief failed:", error.message);
    return null;
  }
  return data as AiBrief;
}

export async function saveSuggestions(
  drafts: SuggestionDraft[],
  ctx: AIContext,
  briefId: string | null,
): Promise<number> {
  if (drafts.length === 0) return 0;
  const supabase = await getSupabaseServer();
  if (!supabase) return 0;

  const expires = format(addDays(parseISO(ctx.forDate), 1), "yyyy-MM-dd");

  const { error } = await supabase.from("ai_suggestions").insert(
    drafts.map((d) => ({
      owner_id: getOwnerId(),
      kind: d.kind,
      title: d.title,
      body: d.body,
      severity: d.severity,
      evidence: d.evidence,
      brief_id: briefId,
      expires_on: expires,
    })),
  );

  if (error) {
    console.error("[ai] saveSuggestions failed:", error.message);
    return 0;
  }
  return drafts.length;
}

export async function expireOldSuggestionsForKind(
  briefId: string,
): Promise<void> {
  const supabase = await getSupabaseServer();
  if (!supabase) return;

  // Mark prior open suggestions linked to older briefs as dismissed,
  // so the feed only shows the freshest run's items.
  const owner = getOwnerId();
  await supabase
    .from("ai_suggestions")
    .update({ status: "dismissed" as AiSuggestionStatus })
    .eq("owner_id", owner)
    .eq("status", "open")
    .neq("brief_id", briefId);
}

export async function getLatestBrief(
  kind: AiBriefKind,
  forDate: string,
): Promise<AiBrief | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;

  const { data } = await supabase
    .from("ai_briefs")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("kind", kind)
    .eq("for_date", forDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return ((data as AiBrief | null) ?? null);
}

export async function listBriefs(limit = 14): Promise<AiBrief[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];

  const { data } = await supabase
    .from("ai_briefs")
    .select("*")
    .eq("owner_id", getOwnerId())
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data as AiBrief[] | null) ?? []);
}

export async function listOpenSuggestions(): Promise<AiSuggestion[]> {
  const supabase = await getSupabaseServer();
  if (!supabase) return [];

  // The owner's today, not the server's. format() here read the runtime zone
  // (UTC on Vercel), so between 00:00 and 08:00 HKT this asked for yesterday
  // and expired suggestions lingered on /assistant.
  const today = todayISO();

  const { data } = await supabase
    .from("ai_suggestions")
    .select("*")
    .eq("owner_id", getOwnerId())
    .eq("status", "open")
    .or(`expires_on.is.null,expires_on.gte.${today}`)
    .order("created_at", { ascending: false });

  return ((data as AiSuggestion[] | null) ?? []);
}

export async function setSuggestionStatus(
  id: string,
  status: AiSuggestionStatus,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await getSupabaseServer();
  if (!supabase) return { ok: false, error: "Supabase not configured" };

  const { error } = await supabase
    .from("ai_suggestions")
    .update({ status })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
