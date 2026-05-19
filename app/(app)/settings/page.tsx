import { SettingsView } from "@/components/modules/settings/SettingsView";
import {
  CLAUDE_ORCHESTRATOR_SYSTEM_PROMPT,
  DEEPSEEK_RESPONDER_SYSTEM_PROMPT,
} from "@/lib/chat/system-prompts";
import {
  DEFAULT_EVENING_BRIEF_PROMPT,
  DEFAULT_MORNING_BRIEF_PROMPT,
} from "@/lib/ai/engine/claude";
import { getPromptSettings } from "@/lib/db/queries/prompt-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getPromptSettings();
  return (
    <SettingsView
      initialSettings={settings}
      defaults={{
        orchestrator: CLAUDE_ORCHESTRATOR_SYSTEM_PROMPT,
        responder: DEEPSEEK_RESPONDER_SYSTEM_PROMPT,
        morningBrief: DEFAULT_MORNING_BRIEF_PROMPT,
        eveningBrief: DEFAULT_EVENING_BRIEF_PROMPT,
      }}
    />
  );
}
