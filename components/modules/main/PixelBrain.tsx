"use client";

import { useEffect, useRef } from "react";

type P = {
  x: number;
  y: number;
  z: number;
  // small per-particle phase so the cloud isn't perfectly uniform
  phase: number;
  base: number;
};

type Pulse = {
  ox: number;
  oy: number;
  oz: number;
  t: number;
  speed: number;
};

// ---------- particle distribution ----------

// Two overlapping ellipsoids = two hemispheres, with a slight elongation and
// surface noise to give an organic brain-like silhouette rather than a sphere.
function buildBrainPoints(count: number): P[] {
  const pts: P[] = [];
  const RA = 1.0; // x radius
  const RB = 0.85; // y radius
  const RC = 0.95; // z radius
  const HEMI_GAP = 0.12; // hemispheres pulled apart along x

  let i = 0;
  let attempts = 0;
  while (i < count && attempts < count * 40) {
    attempts++;
    // sample inside unit cube around the brain
    const x = (Math.random() * 2 - 1) * (RA + HEMI_GAP);
    const y = (Math.random() * 2 - 1) * RB;
    const z = (Math.random() * 2 - 1) * RC;

    // distance to nearest hemisphere center (left/right offset along x)
    const lx = x + HEMI_GAP;
    const rx = x - HEMI_GAP;
    const dl = (lx * lx) / (RA * RA) + (y * y) / (RB * RB) + (z * z) / (RC * RC);
    const dr = (rx * rx) / (RA * RA) + (y * y) / (RB * RB) + (z * z) / (RC * RC);
    const d = Math.min(dl, dr);

    // Bias toward a shell: keep points near the surface of the closer
    // hemisphere, with some interior wisps for depth.
    const shell = Math.abs(d - 1);
    if (shell > 0.18 && Math.random() > 0.18) continue;

    // Gentle surface noise so the silhouette isn't a perfect ellipsoid.
    const noise = (Math.sin(x * 7.1 + y * 3.3) + Math.cos(z * 6.7 - y * 4.1)) * 0.04;
    const sx = x + noise;
    const sy = y + noise * 0.7;
    const sz = z + noise * 0.9;

    pts.push({
      x: sx,
      y: sy,
      z: sz,
      phase: Math.random() * Math.PI * 2,
      base: 0.35 + Math.random() * 0.65,
    });
    i++;
  }
  return pts;
}

export function PixelBrain() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<P[]>([]);
  const pulsesRef = useRef<Pulse[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Rebuild on first sizing so density scales with the panel.
    pointsRef.current = buildBrainPoints(1400);

    // Seed a couple of pulses so the brain looks alive immediately.
    function spawnPulse() {
      const pts = pointsRef.current;
      const seed = pts[Math.floor(Math.random() * pts.length)];
      if (!seed) return;
      pulsesRef.current.push({
        ox: seed.x,
        oy: seed.y,
        oz: seed.z,
        t: 0,
        speed: 0.6 + Math.random() * 0.4,
      });
    }
    spawnPulse();

    let last = performance.now();
    let pulseTimer = 0;
    let rot = 0;
    let bob = 0;

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      pulseTimer += dt;
      if (pulseTimer > 0.9 + Math.random() * 0.8) {
        pulseTimer = 0;
        spawnPulse();
      }

      rot += dt * 0.22;
      bob += dt * 0.9;

      const cx = width / 2;
      const cy = height / 2;
      const scale = Math.min(width, height) * 0.30;

      ctx!.clearRect(0, 0, width, height);

      // soft inner halo behind the brain
      const halo = ctx!.createRadialGradient(cx, cy, 0, cx, cy, scale * 1.4);
      halo.addColorStop(0, "rgba(0, 217, 255, 0.10)");
      halo.addColorStop(0.5, "rgba(0, 217, 255, 0.03)");
      halo.addColorStop(1, "rgba(0, 217, 255, 0)");
      ctx!.fillStyle = halo;
      ctx!.fillRect(0, 0, width, height);

      // advance pulses
      const pulses = pulsesRef.current;
      for (let i = pulses.length - 1; i >= 0; i--) {
        pulses[i].t += dt * pulses[i].speed;
        if (pulses[i].t > 1.6) pulses.splice(i, 1);
      }

      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const cosTilt = Math.cos(0.35);
      const sinTilt = Math.sin(0.35);

      // depth-sort by z' so closer pixels render last
      const pts = pointsRef.current;
      const projected: {
        sx: number;
        sy: number;
        depth: number;
        brightness: number;
        size: number;
      }[] = new Array(pts.length);

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        // small breathing
        const breathe = 1 + Math.sin(bob + p.phase) * 0.015;
        const x = p.x * breathe;
        const y = p.y * breathe;
        const z = p.z * breathe;

        // rotate Y
        const x1 = cosR * x + sinR * z;
        const z1 = -sinR * x + cosR * z;
        // tilt X
        const y2 = cosTilt * y - sinTilt * z1;
        const z2 = sinTilt * y + cosTilt * z1;

        // perspective project
        const persp = 2.2 / (2.2 - z2);
        const sx = cx + x1 * scale * persp;
        const sy = cy + y2 * scale * persp;

        // base brightness from depth + per-particle base
        let b = p.base * (0.55 + persp * 0.45);

        // pulse contribution: ripple expanding from origin in 3D space
        for (let k = 0; k < pulses.length; k++) {
          const pu = pulses[k];
          const dx = p.x - pu.ox;
          const dy = p.y - pu.oy;
          const dz = p.z - pu.oz;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const front = pu.t * 1.8;
          const diff = Math.abs(d - front);
          if (diff < 0.18) {
            const intensity = (1 - diff / 0.18) * (1 - pu.t / 1.6);
            b = Math.min(1.4, b + intensity * 0.9);
          }
        }

        projected[i] = {
          sx,
          sy,
          depth: z2,
          brightness: b,
          size: 0.9 + persp * 0.9,
        };
      }

      // sort back-to-front
      projected.sort((a, b) => a.depth - b.depth);

      // draw
      for (let i = 0; i < projected.length; i++) {
        const q = projected[i];
        const b = q.brightness;
        // hot core for high-brightness particles (during pulses)
        if (b > 1.0) {
          ctx!.fillStyle = `rgba(255, 255, 255, ${Math.min(1, b - 0.55)})`;
          ctx!.fillRect(q.sx - 0.5, q.sy - 0.5, q.size + 0.5, q.size + 0.5);
        } else {
          // cyan accent body. Use alpha for depth fade.
          const alpha = Math.max(0.05, Math.min(1, b * 0.85));
          ctx!.fillStyle = `rgba(0, 217, 255, ${alpha})`;
          ctx!.fillRect(q.sx, q.sy, q.size, q.size);
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}
