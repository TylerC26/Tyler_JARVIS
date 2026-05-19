"use client";

import { useEffect, useRef } from "react";

// Scrolling oscilloscope with three layered signals: alpha/beta/gamma waves
// composited so the trace looks like brain activity rather than a sine.
export function CognitiveWaveform() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let t = 0;
    let raf = 0;
    let last = performance.now();
    let spikeCooldown = 0;
    let spikeAmp = 0;
    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      spikeCooldown -= dt;
      if (spikeCooldown <= 0) {
        spikeCooldown = 1.4 + Math.random() * 2.4;
        spikeAmp = 0.5 + Math.random() * 0.5;
      }
      // decay the spike envelope
      spikeAmp *= Math.pow(0.5, dt * 1.6);

      ctx!.clearRect(0, 0, w, h);

      // grid
      ctx!.strokeStyle = "rgba(0, 217, 255, 0.06)";
      ctx!.lineWidth = 1;
      const cols = 12;
      for (let i = 1; i < cols; i++) {
        const x = (w * i) / cols;
        ctx!.beginPath();
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, h);
        ctx!.stroke();
      }
      ctx!.strokeStyle = "rgba(0, 217, 255, 0.08)";
      ctx!.beginPath();
      ctx!.moveTo(0, h / 2);
      ctx!.lineTo(w, h / 2);
      ctx!.stroke();

      // dim trace (history): low-amplitude sin layered with noise
      ctx!.strokeStyle = "rgba(0, 217, 255, 0.25)";
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      for (let x = 0; x < w; x += 2) {
        const u = x / w;
        const y =
          h / 2 +
          Math.sin(u * 12 + t * 0.8) * h * 0.08 +
          Math.sin(u * 4 - t * 0.3) * h * 0.05;
        if (x === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.stroke();

      // main trace — composite of three frequencies + occasional spike
      ctx!.strokeStyle = "rgba(0, 217, 255, 0.95)";
      ctx!.lineWidth = 1.4;
      ctx!.beginPath();
      for (let x = 0; x <= w; x += 1) {
        const u = x / w;
        // moving wavefronts
        const a = Math.sin(u * 30 - t * 4.2) * 0.22;
        const b = Math.sin(u * 9 - t * 1.7) * 0.18;
        const c = Math.sin(u * 60 - t * 9.0) * 0.06;
        // pinch the spike near the right edge so new events appear "live"
        const spikeMask = Math.exp(-Math.pow((u - 0.82) * 8, 2));
        const spike =
          spikeMask *
          spikeAmp *
          Math.sin((u - 0.82) * 90 - t * 14) *
          0.6;
        const y = h / 2 + (a + b + c + spike) * h * 0.5;
        if (x === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.stroke();

      // hot leading dot
      const leadX = w - 1;
      const leadY =
        h / 2 +
        (Math.sin(30 - t * 4.2) * 0.22 +
          Math.sin(9 - t * 1.7) * 0.18 +
          spikeAmp * Math.sin(8.18 - t * 14) * 0.6) *
          h *
          0.5;
      ctx!.fillStyle = "rgba(0, 217, 255, 1)";
      ctx!.beginPath();
      ctx!.arc(leadX, leadY, 2.2, 0, Math.PI * 2);
      ctx!.fill();

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute left-2 top-1 font-mono text-[9px] uppercase tracking-widest text-fg-dim">
        eeg.1 // 256 Hz
      </div>
      <div className="pointer-events-none absolute right-2 top-1 font-mono text-[9px] uppercase tracking-widest text-accent">
        ● live
      </div>
    </div>
  );
}
