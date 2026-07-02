import { isAnthropicConfigured } from "@/lib/chat/router";
import { getSiteSettingsCore } from "@/lib/db/core/site-settings";
import { LiveReactorClock } from "./LiveReactorClock";
import { Panel } from "./Panel";

type Status = "online" | "offline";

const STATUS_CHIP: Record<Status, string> = {
  online: "border-success/25 text-success",
  offline: "border-danger/30 text-danger",
};

const STATUS_DOT: Record<Status, string> = {
  online: "bg-success",
  offline: "bg-danger",
};

function ProviderRow({
  name,
  meta,
  status,
}: {
  name: string;
  meta: string;
  status: Status;
}) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{name}</span>
      <span className="shrink-0 font-mono text-[10px] text-fg-dim">{meta}</span>
      <span
        className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS_CHIP[status]}`}
      >
        {status}
      </span>
    </li>
  );
}

// The v2 system panel: the reactor clock (the deck's radial identity, kept)
// over the provider rail. Same status logic as the TopBar's StatusRail.
export async function SystemPanel() {
  const hasKey = isAnthropicConfigured();
  const settings = hasKey ? await getSiteSettingsCore() : null;
  const claude: Status =
    hasKey && settings?.claude_enabled ? "online" : "offline";
  const deepseek: Status = process.env.DEEPSEEK_API_KEY ? "online" : "offline";
  const minimax: Status = process.env.MINIMAX_API_KEY ? "online" : "offline";
  const nominal = [deepseek, minimax].every((s) => s === "online");

  return (
    <Panel
      title="System"
      rightSlot={
        <span
          className={[
            "flex items-center gap-1.5 font-hud text-[10px] uppercase tracking-wider",
            nominal ? "text-success" : "text-warn",
          ].join(" ")}
        >
          <span
            className={[
              "size-1.5 rounded-full pulse-dot",
              nominal ? "bg-success" : "bg-warn",
            ].join(" ")}
            aria-hidden
          />
          {nominal ? "Nominal" : "Degraded"}
        </span>
      }
      action={{ href: "/llm", label: "LLM" }}
    >
      <div className="flex flex-col items-center gap-4">
        <LiveReactorClock size={150} />
        <ul className="flex w-full flex-col gap-2.5">
          <ProviderRow name="CLAUDE" meta="anthropic" status={claude} />
          <ProviderRow name="DEEPSEEK" meta="deepseek-chat" status={deepseek} />
          <ProviderRow name="MINIMAX" meta="minimax-m3" status={minimax} />
          <ProviderRow name="SYNC" meta="supabase" status="online" />
        </ul>
      </div>
    </Panel>
  );
}
