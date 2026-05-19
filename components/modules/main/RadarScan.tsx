"use client";

import { useEffect, useRef, useState } from "react";

type Blip = {
  // polar coords relative to radar center, r in [0, 1]
  r: number;
  theta: number;
  // angle at which the sweep last lit this blip; used for fade
  litAt: number;
  intensity: number;
  // semantic — affects the displayed code
  kind: "task" | "signal" | "agent";
};

const KIND_CODE: Record<Blip["kind"], string> = {
  task: "TSK",
  signal: "SGL",
  agent: "AGT",
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function seedBlips(n: number): Blip[] {
  const kinds: Blip["kind"][] = ["task", "signal", "agent"];
  return Array.from({ length: n }, () => ({
    r: Math.sqrt(Math.random()) * 0.92, // sqrt -> uniform area
    theta: Math.random() * Math.PI * 2,
    litAt: -10,
    intensity: 0,
    kind: kinds[Math.floor(Math.random() * kinds.length)],
  }));
}

export function RadarScan() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [contact, setContact] = useState<string>("---");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let size = 0;

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      size = Math.max(1, Math.floor(Math.min(rect.width, rect.height)));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let blips = seedBlips(7);

    let sweep = 0; // radians
    let last = performance.now();
    let lastContactStr = "";
    let raf = 0;

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const prev = sweep;
      sweep = (sweep + dt * 1.2) % (Math.PI * 2);

      const cx = size / 2;
      const cy = size / 2;
      const R = size / 2 - 4;

      ctx!.clearRect(0, 0, size, size);

      // rings
      ctx!.strokeStyle = "rgba(0, 217, 255, 0.18)";
      ctx!.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        ctx!.beginPath();
        ctx!.arc(cx, cy, (R * i) / 4, 0, Math.PI * 2);
        ctx!.stroke();
      }

      // crosshair
      ctx!.strokeStyle = "rgba(0, 217, 255, 0.12)";
      ctx!.beginPath();
      ctx!.moveTo(cx - R, cy);
      ctx!.lineTo(cx + R, cy);
      ctx!.moveTo(cx, cy - R);
      ctx!.lineTo(cx, cy + R);
      ctx!.stroke();

      // sweep wedge: gradient from leading edge fading back
      const wedge = (Math.PI * 2) / 3.5; // ~100deg
      const grad = ctx!.createConicGradient(sweep - Math.PI / 2, cx, cy);
      grad.addColorStop(0, "rgba(0, 217, 255, 0.35)");
      grad.addColorStop(wedge / (Math.PI * 2), "rgba(0, 217, 255, 0)");
      grad.addColorStop(1, "rgba(0, 217, 255, 0)");
      ctx!.fillStyle = grad;
      ctx!.beginPath();
      ctx!.moveTo(cx, cy);
      ctx!.arc(cx, cy, R, sweep - Math.PI / 2 - wedge, sweep - Math.PI / 2);
      ctx!.closePath();
      ctx!.fill();

      // leading line
      ctx!.strokeStyle = "rgba(0, 217, 255, 0.9)";
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.moveTo(cx, cy);
      ctx!.lineTo(cx + Math.cos(sweep - Math.PI / 2) * R, cy + Math.sin(sweep - Math.PI / 2) * R);
      ctx!.stroke();

      // blip update + render
      // A blip is "hit" when sweep crosses its theta during this frame.
      const norm = (t: number) => ((t % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const sweepNow = norm(sweep);
      const sweepPrev = norm(prev);
      const passedAngle = (t: number) => {
        const a = norm(t);
        if (sweepPrev <= sweepNow) return a > sweepPrev && a <= sweepNow;
        return a > sweepPrev || a <= sweepNow; // wrapped
      };

      for (const b of blips) {
        // sweep angle is in standard "math" frame (rotated -PI/2 for north),
        // so compare against b.theta in the same frame.
        if (passedAngle(b.theta + Math.PI / 2)) {
          b.litAt = now / 1000;
          b.intensity = 1;
          const code = KIND_CODE[b.kind];
          // r in km-equivalents (purely cosmetic)
          const range = (b.r * 12).toFixed(1);
          const az = ((b.theta * 180) / Math.PI + 360) % 360;
          const azStr = az.toFixed(0).padStart(3, "0");
          const str = `${code} ${azStr}° ${range}km`;
          if (str !== lastContactStr) {
            lastContactStr = str;
            setContact(str);
          }
        }
        // decay
        const age = now / 1000 - b.litAt;
        b.intensity = Math.max(0, 1 - age / 2.2);

        // position
        const bx = cx + Math.cos(b.theta) * b.r * R;
        const by = cy + Math.sin(b.theta) * b.r * R;

        if (b.intensity > 0.02) {
          // glow
          ctx!.fillStyle = `rgba(0, 217, 255, ${b.intensity * 0.35})`;
          ctx!.beginPath();
          ctx!.arc(bx, by, 6 * b.intensity + 2, 0, Math.PI * 2);
          ctx!.fill();
        }
        // dot
        ctx!.fillStyle = `rgba(0, 217, 255, ${0.3 + 0.7 * b.intensity})`;
        ctx!.fillRect(bx - 1.5, by - 1.5, 3, 3);
      }

      // outer ring tick marks
      ctx!.strokeStyle = "rgba(0, 217, 255, 0.4)";
      for (let i = 0; i < 36; i++) {
        const a = (i * Math.PI * 2) / 36;
        const inner = i % 9 === 0 ? R - 8 : R - 4;
        ctx!.beginPath();
        ctx!.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx!.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx!.stroke();
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // every ~6s shuffle a blip so the radar doesn't go static
    const shuffle = setInterval(() => {
      const idx = Math.floor(Math.random() * blips.length);
      blips[idx] = {
        r: Math.sqrt(Math.random()) * 0.92,
        theta: Math.random() * Math.PI * 2,
        litAt: -10,
        intensity: 0,
        kind: blips[idx].kind,
      };
    }, 4500);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      clearInterval(shuffle);
    };
  }, []);

  return (
    <div className="relative aspect-square w-full">
      <canvas ref={canvasRef} className="absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute bottom-1 left-2 right-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-fg-dim">
        <span>contact</span>
        <span className="text-accent tabular-nums">{contact}</span>
      </div>
    </div>
  );
}
