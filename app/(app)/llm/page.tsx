import { LlmControlView } from "@/components/modules/llm/LlmControlView";
import { listAgentsCore } from "@/lib/db/core/agents";
import { listCronJobsCore } from "@/lib/db/core/cron-jobs";
import { getModelPrefsCore } from "@/lib/db/core/model-prefs";
import { getSiteSettingsCore } from "@/lib/db/core/site-settings";
import { getModelUsageTodayCore } from "@/lib/db/core/usage";

export const dynamic = "force-dynamic";

export default async function LlmPage() {
  const [prefs, agents, cronJobs, settings, usage] = await Promise.all([
    getModelPrefsCore(),
    listAgentsCore(),
    listCronJobsCore(),
    getSiteSettingsCore(),
    getModelUsageTodayCore(),
  ]);

  return (
    <LlmControlView
      initialPrefs={prefs}
      agents={agents.map((a) => ({
        id: a.id,
        name: a.name,
        color: a.color,
        model_pref: a.model_pref,
      }))}
      cronJobs={cronJobs.map((c) => ({
        id: c.id,
        name: c.name,
        schedule: c.schedule,
        model_pref: c.model_pref,
      }))}
      claudeEnabled={settings.claude_enabled}
      usageToday={usage}
    />
  );
}
