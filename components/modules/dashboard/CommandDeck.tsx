"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmtDate } from "@/lib/date";
import type { WifeShiftCode } from "@/lib/db/types";
import { HudFrame } from "./HudFrame";
import { ReactorClock } from "./ReactorClock";

export type DeckCard = {
  id: string;
  code: string;
  glyph: string;
  title: string;
  primary: string;
  secondary: string;
  full: ReactNode;
};

const WIFE_TONE: Record<WifeShiftCode, string> = {
  A: "text-warn",
  P: "text-[#fb923c]",
  P1: "text-[#ea580c]",
  Anight: "text-[#ec4899]",
  NO: "text-[#a78bfa]",
  DO: "text-fg-dim",
};

function greeting(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

type Props = {
  cards: DeckCard[];
  wifeShift: WifeShiftCode | null;
  eventCount: number;
  taskCount: number;
};

// One compact orbiting tile. The outer node is positioned (radial transform or
// grid cell); the inner wrapper floats; the button scales on hover — three
// layers so the three transforms never fight.
function Pod({ card, onOpen, delay }: { card: DeckCard; onOpen: () => void; delay: number }) {
  return (
    <div className="deck-float" style={{ animationDelay: `${delay}s` }}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${card.title}`}
        className="hud-panel group deck-pop relative flex w-[clamp(116px,13vw,150px)] flex-col gap-1 rounded-lg border border-edge/90 px-3 py-2.5 text-left transition-[transform,border-color] duration-200 hover:scale-[1.06] hover:border-accent/50"
        style={{ animationDelay: `${delay + 0.1}s` }}
      >
        <HudFrame />
        <span className="relative z-10 flex items-center gap-1.5">
          <span className="text-sm leading-none text-accent">{card.glyph}</span>
          <span className="font-hud text-[9px] uppercase tracking-[0.2em] text-fg-dim">
            {card.code}
          </span>
          <span
            aria-hidden
            className="ml-auto text-[11px] text-fg-dim opacity-0 transition-opacity group-hover:opacity-100"
          >
            ⤢
          </span>
        </span>
        <span className="relative z-10 font-hud text-[12px] font-semibold uppercase tracking-wide text-fg">
          {card.title}
        </span>
        <span className="relative z-10 flex items-baseline gap-1.5">
          <span className="font-display text-lg leading-none text-accent [text-shadow:0_0_12px_rgba(0,217,255,0.3)]">
            {card.primary}
          </span>
          <span className="truncate font-hud text-[9px] uppercase tracking-wide text-fg-muted">
            {card.secondary}
          </span>
        </span>
      </button>
    </div>
  );
}

export function CommandDeck({ cards, wifeShift, eventCount, taskCount }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Lock scroll + wire Esc while a card is expanded.
  useEffect(() => {
    if (!expandedId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [expandedId]);

  const hour = now ? Number(fmtDate(now, "H")) : null;
  const hello = hour == null ? "Hello" : greeting(hour);
  const dateLine = now ? fmtDate(now, "EEEE, MMMM d") : " ";

  // Radial only when there's genuinely room; otherwise a responsive grid.
  const radial = !!box && box.w >= 820 && box.h >= 560;
  const orbitR = box
    ? Math.max(168, Math.min(Math.min(box.w, box.h) / 2 - 96, 330))
    : 240;
  const centerSize = radial
    ? Math.round(Math.min(264, Math.max(186, orbitR * 0.92)))
    : 168;

  const step = 360 / cards.length;
  const expanded = cards.find((c) => c.id === expandedId) ?? null;

  return (
    <div className="relative flex min-h-[calc(100dvh-9rem)] flex-col gap-4">
      {/* status strip */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.45em] text-accent [text-shadow:0_0_12px_rgba(0,217,255,0.55)]">
          JARVIS
        </span>
        <span aria-hidden className="hud-rule h-px w-8" />
        <h1 className="font-hud text-lg font-semibold tracking-tight text-fg sm:text-xl">
          {hello},{" "}
          <span className="text-accent [text-shadow:0_0_18px_rgba(0,217,255,0.4)]">
            Tyler
          </span>
        </h1>
        <span className="ml-auto flex items-center gap-2.5 font-hud text-[10px] uppercase tracking-[0.16em] text-fg-muted">
          <span className="flex items-center gap-1.5 text-success">
            <span
              className="size-1.5 rounded-full bg-success pulse-dot"
              style={{ boxShadow: "0 0 7px var(--color-success)" }}
              aria-hidden
            />
            Nominal
          </span>
          {wifeShift && (
            <>
              <span className="text-fg-dim">·</span>
              <span className="text-fg-dim">Wife</span>
              <span className={`font-semibold ${WIFE_TONE[wifeShift]}`}>
                {wifeShift}
              </span>
            </>
          )}
          <span className="text-fg-dim">·</span>
          <span>{dateLine}</span>
        </span>
      </header>

      {/* deck stage */}
      <div
        ref={stageRef}
        className="relative flex-1"
        style={{ ["--orbit-r" as string]: `${orbitR}px` }}
      >
        {radial ? (
          <>
            {/* orbit guide ring */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/10"
              style={{ width: orbitR * 2, height: orbitR * 2 }}
            />

            {/* spokes + travelling pulses */}
            {cards.map((card, i) => {
              const theta = -90 + i * step;
              return (
                <div
                  key={`spoke-${card.id}`}
                  aria-hidden
                  className="deck-spoke pointer-events-none absolute left-1/2 top-1/2 h-px overflow-visible"
                  style={{
                    width: `calc(var(--orbit-r) - 66px)`,
                    transformOrigin: "0 0",
                    transform: `rotate(${theta}deg)`,
                    background:
                      "linear-gradient(90deg, rgba(0,217,255,0.5), rgba(0,217,255,0.04))",
                  }}
                >
                  <span
                    className="deck-travel absolute -top-0.5 left-0 size-1 rounded-full bg-accent"
                    style={{ boxShadow: "0 0 6px var(--color-accent)", animationDelay: `${i * 0.34}s` }}
                  />
                </div>
              );
            })}

            {/* reactor at dead centre */}
            <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
              <ReactorClock now={now} size={centerSize} />
            </div>

            {/* orbiting pods */}
            {cards.map((card, i) => {
              const theta = -90 + i * step;
              return (
                <div
                  key={card.id}
                  className="absolute left-1/2 top-1/2 z-20"
                  style={{
                    transformOrigin: "0 0",
                    transform: `rotate(${theta}deg) translateX(var(--orbit-r)) rotate(${-theta}deg) translate(-50%, -50%)`,
                  }}
                >
                  <Pod card={card} delay={i * 0.4} onOpen={() => setExpandedId(card.id)} />
                </div>
              );
            })}
          </>
        ) : (
          <div className="flex flex-col items-center gap-8 py-2">
            <ReactorClock now={now} size={centerSize} />
            <div className="grid w-full grid-cols-2 justify-items-center gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {cards.map((card, i) => (
                <Pod
                  key={card.id}
                  card={card}
                  delay={i * 0.2}
                  onOpen={() => setExpandedId(card.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* expanded full-card overlay */}
      {mounted && expanded
        ? createPortal(
            <div className="fixed inset-0 z-[60] grid place-items-center p-4 sm:p-6">
              <button
                type="button"
                aria-label="Close"
                onClick={() => setExpandedId(null)}
                className="deck-backdrop absolute inset-0 cursor-default bg-base/80 backdrop-blur-md"
              />
              <div className="deck-expand relative z-10 w-full max-w-[640px]">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-hud text-[10px] uppercase tracking-[0.25em] text-accent/80">
                    {expanded.code} // {expanded.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedId(null)}
                    aria-label="Close"
                    className="grid size-8 place-items-center rounded-md border border-edge bg-surface/80 font-mono text-fg-muted transition-colors hover:border-accent/40 hover:text-accent"
                  >
                    ×
                  </button>
                </div>
                <div className="max-h-[82vh] overflow-y-auto">{expanded.full}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
