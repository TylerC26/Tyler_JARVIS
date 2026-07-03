"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { AgentModelPref } from "@/lib/db/types";
import type { JarvisUIMessage } from "@/lib/chat/ui";
import { ChatPanel } from "./ChatPanel";

// Rail card shape — the model preference drives its badge.
export type ThreadAgent = {
  slug: string;
  name: string;
  description: string;
  color: string | null;
  modelPref: AgentModelPref;
};

// What ChatPanel / Message need for the active thread. modelPref is optional so
// the docked launcher (LauncherAgent, no pref resolved) still satisfies it.
export type ActiveAgent = {
  slug: string;
  name: string;
  description: string;
  color: string | null;
  modelId: string | null;
  modelPref?: AgentModelPref;
};

type Props = {
  agents: ThreadAgent[];
  activeAgent: ActiveAgent | null;
  // Tools reachable on the active thread (orchestrator toolbox or the agent's
  // own allowlist) — surfaced in the conversation head.
  toolCount: number;
  initialMessages: JarvisUIMessage[];
  configured: { anthropic: boolean; deepseek: boolean; minimax: boolean };
  // Seeded message (e.g. from a calendar "take notes" deep-link) the active
  // panel should auto-send once on mount. Main Jarvis thread only.
  initialPrompt?: string | null;
  // Whether the active thread's agent supports image upload (OCR/vision tool
  // allowlisted). Resolved server-side; Claudia first.
  imageUploadEnabled?: boolean;
};

const ACCENT = "#00d9ff";

// Short badge for an agent's model preference, shown on its rail card. Legacy
// 'claude' resolves to opus; 'auto' shows as auto.
export function modelPrefLabel(pref: AgentModelPref): string {
  switch (pref) {
    case "claude":
    case "opus":
      return "opus";
    case "sonnet":
      return "sonnet";
    case "haiku":
      return "haiku";
    case "deepseek":
      return "deepseek";
    case "minimax":
      return "minimax";
    default:
      return "auto";
  }
}

// Last line of persisted text in a thread, for the active card's preview.
function lastPreview(messages: JarvisUIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messages[i].parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join(" ")
      .trim();
    if (text) return text;
  }
  return null;
}

export function ChatWorkspace({
  agents,
  activeAgent,
  toolCount,
  initialMessages,
  configured,
  initialPrompt = null,
  imageUploadEnabled = false,
}: Props) {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const activeSlug = activeAgent?.slug ?? null;
  const preview = lastPreview(initialMessages);

  function openThread(slug: string | null) {
    if (slug === activeSlug) return;
    startNav(() => {
      router.push(slug ? `/chat?agent=${encodeURIComponent(slug)}` : "/chat");
    });
  }

  return (
    <div className="flex h-full flex-col gap-2 md:flex-row md:gap-3">
      {/* Threads + agents rail — horizontal scroller on mobile, sidebar column
          on md+. */}
      <nav
        aria-label="Chat threads"
        className={[
          "flex shrink-0 flex-col gap-1.5 overflow-x-auto rounded-md border border-edge bg-base/95",
          "md:w-72 md:overflow-x-visible md:overflow-y-auto",
          navigating ? "opacity-60" : "",
        ].join(" ")}
      >
        {/* rail header */}
        <div className="hidden items-center gap-2 border-b border-edge px-3.5 py-3 md:flex">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            // threads
          </span>
          <button
            type="button"
            onClick={() => openThread(null)}
            className="ml-auto rounded-sm border border-accent/30 bg-accent/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-accent hover:bg-accent/15"
          >
            + new
          </button>
        </div>

        <div className="flex gap-1.5 p-1.5 md:flex-col md:p-3">
          <RailCard
            label="Jarvis"
            sublabel={
              activeSlug === null && preview ? preview : "orchestrator · all tools"
            }
            tag={activeSlug === null ? "● idle" : "orchestrator"}
            tagAccent={activeSlug === null}
            dotColor={ACCENT}
            glyph
            active={activeSlug === null}
            onClick={() => openThread(null)}
          />

          {agents.length > 0 && (
            <div className="hidden px-1 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim md:block">
              // agents
            </div>
          )}

          {agents.map((a) => {
            const isActive = activeSlug === a.slug;
            return (
              <RailCard
                key={a.slug}
                label={a.name}
                sublabel={
                  isActive && preview ? preview : a.description
                }
                tag={modelPrefLabel(a.modelPref)}
                dotColor={a.color ?? ACCENT}
                active={isActive}
                onClick={() => openThread(a.slug)}
              />
            );
          })}

          <a
            href="/agents"
            className="hidden shrink-0 rounded-sm border border-dashed border-edge px-2 py-2.5 text-center font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:border-edge-strong hover:text-fg-muted md:mt-1 md:block"
          >
            + manage agents
          </a>
        </div>
      </nav>

      {/* Active thread. Keyed by slug so useChat state fully resets on switch. */}
      <div className="min-h-0 min-w-0 flex-1">
        <ChatPanel
          key={activeSlug ?? "main"}
          initialMessages={initialMessages}
          configured={configured}
          variant="page"
          agent={activeAgent}
          toolCount={toolCount}
          initialPrompt={initialPrompt}
          imageUploadEnabled={imageUploadEnabled}
        />
      </div>
    </div>
  );
}

function RailCard({
  label,
  sublabel,
  tag,
  tagAccent,
  dotColor,
  glyph,
  active,
  onClick,
}: {
  label: string;
  sublabel: string;
  tag: string;
  tagAccent?: boolean;
  dotColor: string;
  glyph?: boolean;
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
        "group flex w-52 shrink-0 flex-col gap-1.5 border px-3.5 py-3 text-left transition-colors md:w-full md:shrink",
        active
          ? "border-accent/50 bg-accent/[0.06]"
          : "border-edge bg-surface-2/40 hover:border-edge-strong hover:bg-surface-2",
      ].join(" ")}
    >
      <div className="flex items-center gap-2.5">
        {glyph ? (
          <span
            className="size-3 shrink-0 rotate-45 border-2"
            style={{ borderColor: dotColor }}
            aria-hidden
          />
        ) : (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: dotColor }}
            aria-hidden
          />
        )}
        <span
          className={[
            "truncate font-mono text-[13px] font-semibold",
            active ? "text-fg" : "text-fg group-hover:text-fg",
          ].join(" ")}
        >
          {label}
        </span>
        <span
          className={[
            "ml-auto shrink-0 font-mono text-[9px] uppercase tracking-wider",
            tagAccent ? "text-success" : "text-fg-dim",
          ].join(" ")}
        >
          {tag}
        </span>
      </div>
      <span className="truncate font-mono text-[11px] leading-relaxed text-fg-dim">
        {sublabel}
      </span>
    </button>
  );
}
