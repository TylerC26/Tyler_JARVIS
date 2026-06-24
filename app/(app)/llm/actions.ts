"use server";

import { revalidatePath } from "next/cache";
import { invalidateModelPrefsCache } from "@/lib/ai/model-prefs";
import { updateAgentCore } from "@/lib/db/core/agents";
import { updateCronJobCore } from "@/lib/db/core/cron-jobs";
import { setModelPrefCore } from "@/lib/db/core/model-prefs";
import { setClaudeEnabledCore } from "@/lib/db/core/site-settings";
import type { AgentModelPref, ModelPref } from "@/lib/db/types";

function bump() {
  revalidatePath("/llm");
  revalidatePath("/chat");
  revalidatePath("/agents");
  revalidatePath("/cron");
}

export async function setFeatureModelAction(
  featureKey: string,
  modelPref: ModelPref,
) {
  const result = await setModelPrefCore(featureKey, modelPref);
  invalidateModelPrefsCache();
  if (result.ok) bump();
  return result;
}

export async function setAgentModelAction(
  agentId: string,
  modelPref: AgentModelPref,
) {
  const result = await updateAgentCore(agentId, { model_pref: modelPref });
  if (result.ok) bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function setCronModelAction(cronId: string, modelPref: ModelPref) {
  const result = await updateCronJobCore(cronId, { model_pref: modelPref });
  if (result.ok) bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}

export async function setClaudeEnabledAction(enabled: boolean) {
  const result = await setClaudeEnabledCore(enabled);
  if (result.ok) bump();
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, error: result.error };
}
