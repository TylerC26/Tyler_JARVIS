import { CognitiveWaveform } from "@/components/modules/main/CognitiveWaveform";
import { HudRings } from "@/components/modules/main/HudRings";
import { MemoryBars } from "@/components/modules/main/MemoryBars";
import { PixelBrain } from "@/components/modules/main/PixelBrain";
import { RadarScan } from "@/components/modules/main/RadarScan";
import { SignalFeed } from "@/components/modules/main/SignalFeed";
import { StatStack } from "@/components/modules/main/StatStack";
import { StatusStrip } from "@/components/modules/main/StatusStrip";

export const dynamic = "force-dynamic";

export default function MainPage() {
  return (
    <div className="relative flex flex-col gap-4 -mx-4 md:-mx-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-edge/60 px-4 pb-2 md:px-6">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-accent">◢◤</span>
          <h1 className="font-mono text-base font-semibold tracking-[0.4em]">
            COMMAND CENTER
          </h1>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-dim">
            session 0xA7-F2 · operator tyler
          </span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest">
          <Pill dot="success" label="db" value="online" />
          <Pill dot="success" label="claude" value="ready" />
          <Pill dot="warn" label="deepseek" value="standby" />
          <Pill dot="success" label="sync" value="live" />
        </div>
      </header>

      {/* HUD stage */}
      <div className="relative px-4 md:px-6">
        <div className="relative mx-auto w-full" style={{ height: "min(86vh, 980px)", minHeight: 640 }}>
          {/* Central HUD */}
          <div className="absolute inset-0 grid place-items-center">
            <BrainHud />
          </div>

          {/* Floating telemetry blades */}
          <Blade
            position="top-left"
            code="RAD"
            title="radar.local"
            hint="2.4 GHz · 4 km"
            width={280}
          >
            <RadarScan />
          </Blade>

          <Blade
            position="bottom-left"
            code="STA"
            title="vitals"
            hint="rolling 60s"
            width={300}
          >
            <StatStack />
          </Blade>

          <Blade
            position="top-right"
            code="EEG"
            title="cognitive.wave"
            hint="α + β + γ"
            width={320}
          >
            <div style={{ height: 110 }} className="relative">
              <CognitiveWaveform />
            </div>
          </Blade>

          <Blade
            position="middle-right"
            code="MEM"
            title="memory.bands"
            hint="12 channels"
            width={320}
          >
            <MemoryBars />
          </Blade>

          <Blade
            position="bottom-right"
            code="LOG"
            title="signal.feed"
            hint="live tail"
            width={360}
          >
            <SignalFeed />
          </Blade>

          {/* Scattered floating callouts */}
          <Callout className="absolute left-1/2 top-3 -translate-x-1/2 text-center">
            <span className="text-fg-dim">target //</span>{" "}
            <span className="text-accent">cogn.matrix.0x7F</span>
          </Callout>
          <Callout className="absolute left-1/2 bottom-3 -translate-x-1/2 text-center">
            <span className="text-fg-dim">lock</span>{" "}
            <span className="text-accent">●●●●●</span>{" "}
            <span className="text-fg-dim">tracking</span>
          </Callout>
        </div>
      </div>

      <div className="px-4 md:px-6">
        <StatusStrip />
      </div>
    </div>
  );
}

// ---------- visual primitives (local to /main) ----------

function BrainHud() {
  return (
    <div className="relative aspect-square h-full max-h-[920px] w-auto">
      {/* radial dark backdrop for contrast against the rings */}
      <div
        className="pointer-events-none absolute inset-[6%] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(0,217,255,0.06) 0%, rgba(0,217,255,0.02) 50%, rgba(0,0,0,0) 75%)",
        }}
      />

      {/* brain canvas constrained to inner circle by clip-path */}
      <div
        className="absolute"
        style={{
          // Inner ring radius in HudRings is 310/1000 of the box. Match it.
          inset: "19%",
          clipPath: "circle(50% at 50% 50%)",
        }}
      >
        <PixelBrain />
      </div>

      {/* rings overlay */}
      <HudRings />

      {/* center identity label, dimmed */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-accent/70">
          j.a.r.v.i.s
        </span>
        <span className="font-mono text-[8px] uppercase tracking-[0.5em] text-fg-dim">
          core // v4.7
        </span>
      </div>
    </div>
  );
}

type BladePosition =
  | "top-left"
  | "top-right"
  | "middle-right"
  | "bottom-left"
  | "bottom-right";

const POSITION_CLS: Record<BladePosition, string> = {
  "top-left": "left-0 top-0",
  "top-right": "right-0 top-0",
  "middle-right": "right-0 top-[40%]",
  "bottom-left": "left-0 bottom-0",
  "bottom-right": "right-0 bottom-0",
};

function Blade({
  position,
  code,
  title,
  hint,
  width,
  children,
}: {
  position: BladePosition;
  code: string;
  title: string;
  hint?: string;
  width: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className={[
        "absolute z-10 flex flex-col gap-1 rounded-sm border border-accent/15 bg-base/60 px-2.5 py-2 backdrop-blur-sm",
        POSITION_CLS[position],
      ].join(" ")}
      style={{ width }}
    >
      {/* corner brackets */}
      <CornerBrackets />

      <header className="flex items-center justify-between font-mono">
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-[0.25em] text-accent">
            {code}
          </span>
          <span className="text-[11px] text-fg">{title}</span>
        </div>
        {hint && (
          <span className="text-[9px] uppercase tracking-widest text-fg-dim">
            {hint}
          </span>
        )}
      </header>

      <div className="relative">{children}</div>
    </section>
  );
}

function CornerBrackets() {
  const cls =
    "pointer-events-none absolute size-2 border-accent/60";
  return (
    <>
      <span className={`${cls} left-0 top-0 border-l border-t`} />
      <span className={`${cls} right-0 top-0 border-r border-t`} />
      <span className={`${cls} left-0 bottom-0 border-l border-b`} />
      <span className={`${cls} right-0 bottom-0 border-r border-b`} />
    </>
  );
}

function Pill({
  dot,
  label,
  value,
}: {
  dot: "success" | "warn" | "danger";
  label: string;
  value: string;
}) {
  const dotCls =
    dot === "success"
      ? "bg-success"
      : dot === "warn"
      ? "bg-warn"
      : "bg-danger";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`pulse-dot inline-block size-1.5 rounded-full ${dotCls}`} />
      <span className="text-fg-muted">{label}</span>
      <span className="text-fg">{value}</span>
    </span>
  );
}

function Callout({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "pointer-events-none z-20 font-mono text-[10px] uppercase tracking-[0.3em]",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
