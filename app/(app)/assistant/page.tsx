import { AssistantView } from "@/components/modules/assistant/AssistantView";
import { todayISO } from "@/lib/date";
import {
  getLatestBrief,
  listBriefs,
  listOpenSuggestions,
} from "@/lib/ai/store";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const today = todayISO();
  const [morning, evening, suggestions, history] = await Promise.all([
    getLatestBrief("morning", today),
    getLatestBrief("evening", today),
    listOpenSuggestions(),
    listBriefs(14),
  ]);

  return (
    <AssistantView
      morning={morning}
      evening={evening}
      suggestions={suggestions}
      history={history}
    />
  );
}
