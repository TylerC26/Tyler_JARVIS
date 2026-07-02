"use client";

// Animated equalizer bars for the live recorder. Bars oscillate on staggered
// durations while active; the wrapper's scaleY tracks the real input level so
// the meter visibly reacts to speech (level is 0..1 peak amplitude — speech
// sits low, so gain is applied). Idle bars sit flat.

const BARS = [
  { duration: 0.9, delay: 0 },
  { duration: 0.7, delay: 0.1 },
  { duration: 1.1, delay: 0.2 },
  { duration: 0.8, delay: 0.05 },
  { duration: 0.95, delay: 0.15 },
];

export function Waveform({
  active,
  level,
  barClass = "bg-accent",
}: {
  active: boolean;
  /** 0..1 input level; omit for a purely decorative animation. */
  level?: number;
  barClass?: string;
}) {
  const scale =
    level == null ? 1 : Math.max(0.35, Math.min(1, 0.35 + level * 2.2));

  return (
    <div
      className="flex h-5 items-center gap-[3px] transition-transform duration-100"
      style={{ transform: `scaleY(${active ? scale : 1})` }}
      aria-hidden
    >
      {BARS.map((b, i) => (
        <span
          key={i}
          className={`eq-bar h-full w-[3px] ${active ? barClass : "bg-edge"}`}
          style={
            active
              ? { animationDuration: `${b.duration}s`, animationDelay: `${b.delay}s` }
              : { animation: "none", transform: "scaleY(0.28)" }
          }
        />
      ))}
    </div>
  );
}
