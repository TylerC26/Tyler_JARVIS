import {
  CommandDeck,
  type DeckCard,
} from "@/components/modules/dashboard/CommandDeck";
import { HudBackdrop } from "@/components/modules/dashboard/HudBackdrop";
import { TerminalAgenda } from "@/components/modules/dashboard/TerminalAgenda";
import { TerminalBrief } from "@/components/modules/dashboard/TerminalBrief";
import { TerminalOffice } from "@/components/modules/dashboard/TerminalOffice";
import { TerminalPlaces } from "@/components/modules/dashboard/TerminalPlaces";
import { TerminalPrompt } from "@/components/modules/dashboard/TerminalPrompt";
import { TerminalRecent } from "@/components/modules/dashboard/TerminalRecent";
import { TerminalSpend } from "@/components/modules/dashboard/TerminalSpend";
import { TerminalTasks } from "@/components/modules/dashboard/TerminalTasks";
import { getLatestBrief } from "@/lib/ai/store";
import {
  endOfOwnerDay,
  startOfOwnerDay,
  startOfOwnerMonth,
  todayISO,
} from "@/lib/date";
import { listRecentAgentRunsCore } from "@/lib/db/core/agent-runs";
import { listAgentsCore } from "@/lib/db/core/agents";
import { listEventsInRangeCore } from "@/lib/db/core/events";
import { listIdeasCore } from "@/lib/db/core/ideas";
import { listNotesCore } from "@/lib/db/core/notes";
import { listPlacesCore } from "@/lib/db/core/places";
import { getSpendSummaryCore } from "@/lib/db/core/usage";
import { listWifeShiftsInRangeCore } from "@/lib/db/core/wife-shifts";
import { listTodayTasks } from "@/lib/db/queries/tasks";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const today = todayISO();
  const dayStart = startOfOwnerDay();
  const dayEnd = endOfOwnerDay();

  const [brief, events, shifts, tasks, notes, ideas, places, spend, agents, runs] =
    await Promise.all([
      getLatestBrief("morning", today),
      listEventsInRangeCore(dayStart.toISOString(), dayEnd.toISOString()),
      listWifeShiftsInRangeCore(today, today),
      listTodayTasks(6),
      listNotesCore(),
      listIdeasCore(),
      listPlacesCore({ status: "want_to_go" }),
      getSpendSummaryCore(startOfOwnerMonth().toISOString()),
      listAgentsCore({ activeOnly: true }),
      listRecentAgentRunsCore(14),
    ]);

  const activeRuns = runs.filter((r) => r.status === "running").length;
  const captures = Math.min(notes.length + ideas.length, 99);

  // The pods orbit the reactor starting from the top, clockwise. Each carries a
  // compact preview; clicking expands `full` (the existing card) in an overlay.
  const cards: DeckCard[] = [
    {
      id: "brief",
      code: "BRF",
      glyph: "◊",
      title: "Morning Brief",
      primary: brief ? "✓" : "…",
      secondary: brief ? "ready" : "pending",
      full: <TerminalBrief brief={brief} />,
    },
    {
      id: "today",
      code: "TDY",
      glyph: "▦",
      title: "Today",
      primary: String(events.length),
      secondary: events.length === 1 ? "event" : "events",
      full: <TerminalAgenda events={events} />,
    },
    {
      id: "tasks",
      code: "TSK",
      glyph: "▤",
      title: "Tasks",
      primary: String(tasks.length),
      secondary: "due today",
      full: <TerminalTasks />,
    },
    {
      id: "agents",
      code: "AGT",
      glyph: "⊞",
      title: "Agents",
      primary: String(agents.length),
      secondary: activeRuns > 0 ? `${activeRuns} active` : "monitoring",
      full: <TerminalOffice />,
    },
    {
      id: "spend",
      code: "SPD",
      glyph: "◎",
      title: "Spend",
      primary: `$${Math.round(spend.total_usd)}`,
      secondary: "this month",
      full: <TerminalSpend />,
    },
    {
      id: "recent",
      code: "REC",
      glyph: "▢",
      title: "Recent",
      primary: String(captures),
      secondary: "captures",
      full: <TerminalRecent notes={notes.slice(0, 5)} ideas={ideas.slice(0, 5)} />,
    },
    {
      id: "places",
      code: "PLC",
      glyph: "⌖",
      title: "Places",
      primary: String(places.length),
      secondary: "to visit",
      full: <TerminalPlaces places={places} />,
    },
    {
      id: "capture",
      code: "CAP",
      glyph: "✎",
      title: "Quick Capture",
      primary: "＋",
      secondary: "note / idea",
      full: <TerminalPrompt />,
    },
  ];

  return (
    <>
      <HudBackdrop />
      <CommandDeck
        cards={cards}
        wifeShift={shifts[0]?.code ?? null}
        eventCount={events.length}
        taskCount={tasks.length}
      />
    </>
  );
}
