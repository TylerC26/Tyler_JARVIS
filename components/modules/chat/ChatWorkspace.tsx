"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { JarvisUIMessage } from "@/lib/chat/ui";
import { ChatPanel } from "./ChatPanel";

export type ThreadAgent = {
  slug: string;
  name: string;
  description: string;
  color: string | null;
};

export type ActiveAgent = ThreadAgent & { modelId: string | null };

type Props = {
  agents: ThreadAgent[];
  activeAgent: ActiveAgent | null;
  initialMessages: JarvisUIMessage[];
  configured: { anthropic: boolean; deepseek: boolean };
};

const ACCENT = "#00d9ff";

export function ChatWorkspace({
  agents,
  activeAgent,
  initialMessages,
  configured,
}: Props) {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const activeSlug = activeAgent?.slug ?? null;

  function openThread(slug: string | null) {
    if (slug === activeSlug) return;
    startNav(() => {
      router.push(slug ? `/chat?agent=${encodeURIComponent(slug)}` : "/chat");
    });
  }

  return (
    <div className="flex h-full flex-col gap-2 md:flex-row md:gap-3">
      {/* Thread rail — horizontal scroller on mobile, sidebar column on md+. */}
      <nav
        aria-label="Chat threads"
        className={[
          "flex shrink-0 gap-1.5 overflow-x-auto rounded-md border border-edge bg-base/95 p-1.5",
          "md:w-56 md:flex-col md:overflow-x-visible md:overflow-y-auto md:p-2",
          navigating ? "opacity-60" : "",
        ].join(" ")}
      >
        <div className="hidden px-1 pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim md:block">
          threads
        </div>

        <ThreadItem
          label="Jarvis"
          sublabel="orchestrator · all tools"
          dotColor={ACCENT}
          glyph="◢◤"
          active={activeSlug === null}
          onClick={() => openThread(null)}
        />

        {agents.length > 0 && (
          <div className="hidden px-1 pt-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim md:block">
            agents
          </div>
        )}

        {agents.map((a) => (
          <ThreadItem
            key={a.slug}
            label={a.name}
            sublabel={a.description}
            dotColor={a.color ?? ACCENT}
            active={activeSlug === a.slug}
            onClick={() => openThread(a.slug)}
          />
        ))}

        <a
          href="/agents"
          className="hidden shrink-0 rounded-sm border border-dashed border-edge px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:border-edge-strong hover:text-fg-muted md:mt-1 md:block"
        >
          + manage agents
        </a>
      </nav>

      {/* Active thread. Keyed by slug so useChat state fully resets on switch. */}
      <div className="min-h-0 min-w-0 flex-1">
        <ChatPanel
          key={activeSlug ?? "main"}
          initialMessages={initialMessages}
          configured={configured}
          variant="page"
          agent={activeAgent}
        />
      </div>
    </div>
  );
}

function ThreadItem({
  label,
  sublabel,
  dotColor,
  glyph,
  active,
  onClick,
}: {
  label: string;
  sublabel: string;
  dotColor: string;
  glyph?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={`${label} — ${sublabel}`}
      className={[
        "group flex shrink-0 items-center gap-2 rounded-sm border px-2.5 py-1.5 text-left transition-colors md:shrink",
        "md:flex-col md:items-start md:gap-1 md:py-2",
        active
          ? "border-accent/60 bg-accent/10"
          : "border-edge bg-surface-2/40 hover:border-edge-strong hover:bg-surface-2",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        {glyph ? (
          <span
            className="font-mono text-[11px] leading-none"
            style={{ color: dotColor }}
            aria-hidden
          >
            {glyph}
          </span>
        ) : (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: dotColor }}
            aria-hidden
          />
        )}
        <span
          className={[
            "truncate font-mono text-[12px]",
            active ? "text-accent" : "text-fg group-hover:text-fg",
          ].join(" ")}
        >
          {label}
        </span>
      </div>
      <span className="hidden truncate font-mono text-[10px] leading-relaxed text-fg-dim md:block md:max-w-full">
        {sublabel}
      </span>
    </button>
  );
}
