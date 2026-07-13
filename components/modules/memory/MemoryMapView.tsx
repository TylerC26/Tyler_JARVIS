"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MemoryGraph,
  MemoryGraphEdge,
} from "@/lib/db/queries/memory-graph";
import { MEMORY_KINDS, type MemoryKind } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Palette — one colour per memory kind, tuned to read on the dark graph field.
// Canvas needs concrete hexes (it can't resolve CSS tokens), so these are the
// source of truth for both the canvas and the React chrome (legend/inspector).
// ---------------------------------------------------------------------------
const KIND_STYLE: Record<MemoryKind, { label: string; color: string; glow: string }> = {
  identity: { label: "identity", color: "#e6edf0", glow: "rgba(230,237,240,.55)" },
  relationship: { label: "relationship", color: "#f0a5d0", glow: "rgba(240,165,208,.55)" },
  preference: { label: "preference", color: "#5ee2a0", glow: "rgba(94,226,160,.55)" },
  health: { label: "health", color: "#f5b14d", glow: "rgba(245,177,77,.55)" },
  work: { label: "work", color: "#7aa2ff", glow: "rgba(122,162,255,.55)" },
  routine: { label: "routine", color: "#a78bfa", glow: "rgba(167,139,250,.55)" },
  goal: { label: "goal", color: "#f7d267", glow: "rgba(247,210,103,.55)" },
  knowledge: { label: "knowledge", color: "#8ad6e8", glow: "rgba(138,214,232,.55)" },
  context: { label: "context", color: "#9aa0ab", glow: "rgba(154,160,171,.5)" },
};

const EDGE_ACCENT = "0,217,255"; // semantic — app accent cyan (rgb)
const EDGE_SUPERSEDE = "245,177,77"; // supersede correction chain — amber

// Physics — scaled up from the mock (~40 nodes) for a ~240-node store.
const SIM = {
  repulsion: 3200,
  springLen: 74,
  springK: 0.014,
  center: 0.0016,
  damping: 0.85,
  prewarm: 320,
};

type SimNode = {
  id: string;
  label: string;
  kind: MemoryKind;
  superseded: boolean;
  unlinked: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  deg: number;
  fixed: boolean;
};

function fmtRel(input: string | null): string {
  if (!input) return "never";
  const d = new Date(input).getTime();
  const mins = Math.floor((Date.now() - d) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(input).toLocaleDateString();
}

export function MemoryMapView({ graph }: { graph: MemoryGraph }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [hideSuperseded, setHideSuperseded] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Simulation state lives in refs so the rAF loop never closes over stale
  // React state. `viewRef` mirrors the render-affecting state each render.
  const nodesRef = useRef<SimNode[]>([]);
  const idxRef = useRef<Map<string, number>>(new Map());
  const linksRef = useRef<{ s: number; t: number; type: MemoryGraphEdge["type"]; w: number }[]>([]);
  const camRef = useRef({ x: 0, y: 0, scale: 1 });
  const alphaRef = useRef(1);
  const hoverRef = useRef<string | null>(null);
  const draggingRef = useRef(false);
  const sizeRef = useRef({ w: 0, h: 0 });
  const viewRef = useRef({ selected, search, hidden, hideSuperseded });
  viewRef.current = { selected, search, hidden, hideSuperseded };

  // Adjacency (for the inspector's linked-records list), keyed by node id.
  const adjacency = useMemo(() => {
    const map = new Map<string, { id: string; weight: number; type: MemoryGraphEdge["type"] }[]>();
    for (const n of graph.nodes) map.set(n.id, []);
    for (const e of graph.edges) {
      map.get(e.source)?.push({ id: e.target, weight: e.weight, type: e.type });
      map.get(e.target)?.push({ id: e.source, weight: e.weight, type: e.type });
    }
    for (const list of map.values()) list.sort((a, b) => b.weight - a.weight);
    return map;
  }, [graph]);

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph],
  );

  const kindCounts = useMemo(() => {
    const c: Partial<Record<MemoryKind, number>> = {};
    for (const n of graph.nodes) c[n.kind] = (c[n.kind] ?? 0) + 1;
    return c;
  }, [graph]);

  const reheat = useCallback((to = 0.6) => {
    alphaRef.current = Math.max(alphaRef.current, to);
  }, []);

  // ---- build the simulation from props (once per graph identity) ----
  useEffect(() => {
    const idx = new Map<string, number>();
    const nodes: SimNode[] = graph.nodes.map((n, i) => {
      idx.set(n.id, i);
      return {
        id: n.id,
        label: n.key,
        kind: n.kind,
        superseded: n.status === "superseded",
        unlinked: n.status === "active" && !n.hasEmbedding,
        x: Math.cos(i * 2.399) * (110 + (i % 11) * 26),
        y: Math.sin(i * 2.399) * (110 + (i % 7) * 30),
        vx: 0,
        vy: 0,
        r: 5,
        deg: 0,
        fixed: false,
      };
    });
    const links: { s: number; t: number; type: MemoryGraphEdge["type"]; w: number }[] = [];
    for (const e of graph.edges) {
      const s = idx.get(e.source);
      const t = idx.get(e.target);
      if (s == null || t == null) continue;
      links.push({ s, t, type: e.type, w: e.weight });
      nodes[s].deg++;
      nodes[t].deg++;
    }
    for (const n of nodes) n.r = Math.min(16, 5 + n.deg * 0.85);
    nodesRef.current = nodes;
    idxRef.current = idx;
    linksRef.current = links;
    alphaRef.current = 1;
  }, [graph]);

  // fit() is defined inside the canvas effect; expose it for the toolbar.
  const fitRef = useRef<null | (() => void)>(null);
  const zoomBy = useCallback((factor: number) => {
    const cam = camRef.current;
    cam.scale = Math.min(3.4, Math.max(0.25, cam.scale * factor));
  }, []);

  // ---- canvas: physics + render loop, camera, interactions ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const panel = panelRef.current;
    if (!canvas || !panel) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = panel.clientWidth;
      const h = panel.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
    };

    const w2s = (x: number, y: number): [number, number] => {
      const c = camRef.current;
      const { w, h } = sizeRef.current;
      return [(x - c.x) * c.scale + w / 2, (y - c.y) * c.scale + h / 2];
    };
    const s2w = (x: number, y: number): [number, number] => {
      const c = camRef.current;
      const { w, h } = sizeRef.current;
      return [(x - w / 2) / c.scale + c.x, (y - h / 2) / c.scale + c.y];
    };

    const visible = (n: SimNode) => {
      const v = viewRef.current;
      if (v.hidden[n.kind]) return false;
      if (v.hideSuperseded && n.superseded) return false;
      return true;
    };

    const fit = () => {
      const nodes = nodesRef.current.filter(visible);
      if (nodes.length === 0) return;
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (const n of nodes) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
      const gw = Math.max(1, maxX - minX);
      const gh = Math.max(1, maxY - minY);
      const { w, h } = sizeRef.current;
      const cam = camRef.current;
      cam.x = (minX + maxX) / 2;
      cam.y = (minY + maxY) / 2;
      const pad = 110;
      cam.scale = Math.min((w - pad) / gw, (h - pad) / gh, 1.5);
      if (!isFinite(cam.scale) || cam.scale <= 0) cam.scale = 1;
    };
    fitRef.current = fit;

    const tick = () => {
      const N = nodesRef.current;
      for (let i = 0; i < N.length; i++) {
        const a = N[i];
        for (let j = i + 1; j < N.length; j++) {
          const b = N[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 0.01;
          const f = SIM.repulsion / d2;
          const d = Math.sqrt(d2);
          const ux = dx / d;
          const uy = dy / d;
          a.vx += ux * f;
          a.vy += uy * f;
          b.vx -= ux * f;
          b.vy -= uy * f;
        }
      }
      for (const l of linksRef.current) {
        const a = N[l.s];
        const b = N[l.t];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - SIM.springLen) * SIM.springK;
        const ux = dx / d;
        const uy = dy / d;
        a.vx += ux * f;
        a.vy += uy * f;
        b.vx -= ux * f;
        b.vy -= uy * f;
      }
      for (const n of N) {
        n.vx += -n.x * SIM.center;
        n.vy += -n.y * SIM.center;
        n.vx *= SIM.damping;
        n.vy *= SIM.damping;
        if (!n.fixed) {
          n.x += n.vx;
          n.y += n.vy;
        }
      }
    };

    // focus set: selected -> node+neighbours; else search matches; else null.
    const focusSet = (): Set<string> | null => {
      const v = viewRef.current;
      if (v.selected != null) {
        const s = new Set<string>([v.selected]);
        for (const nb of adjacency.get(v.selected) ?? []) s.add(nb.id);
        return s;
      }
      const q = v.search.trim().toLowerCase();
      if (q) {
        const s = new Set<string>();
        for (const n of graph.nodes) {
          if (
            n.key.toLowerCase().includes(q) ||
            n.value.toLowerCase().includes(q) ||
            n.kind.toLowerCase().includes(q)
          )
            s.add(n.id);
        }
        return s;
      }
      return null;
    };

    const draw = () => {
      const { w, h } = sizeRef.current;
      ctx.clearRect(0, 0, w, h);
      const N = nodesRef.current;
      const cam = camRef.current;
      const focus = focusSet();
      const hover = hoverRef.current;
      const sel = viewRef.current.selected;

      // edges
      for (const l of linksRef.current) {
        const a = N[l.s];
        const b = N[l.t];
        if (!visible(a) || !visible(b)) continue;
        const [ax, ay] = w2s(a.x, a.y);
        const [bx, by] = w2s(b.x, b.y);
        const on = !focus || (focus.has(a.id) && focus.has(b.id));
        const rgb = l.type === "supersede" ? EDGE_SUPERSEDE : EDGE_ACCENT;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        if (on) {
          const alpha = l.type === "supersede" ? 0.5 : 0.22 + Math.min(0.4, (l.w - 0.4) * 0.6);
          ctx.strokeStyle = `rgba(${rgb},${alpha})`;
          ctx.lineWidth = l.type === "supersede" ? 1.1 : 0.7 + l.w * 0.8;
          if (l.type === "supersede") ctx.setLineDash([3, 3]);
        } else {
          ctx.strokeStyle = "rgba(120,132,142,.06)";
          ctx.lineWidth = 0.7;
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // nodes
      for (const n of N) {
        if (!visible(n)) continue;
        const [x, y] = w2s(n.x, n.y);
        const style = KIND_STYLE[n.kind];
        const dim = focus != null && !focus.has(n.id);
        const r = Math.max(1.6, n.r * cam.scale);
        ctx.globalAlpha = dim ? 0.14 : n.superseded ? 0.5 : 1;

        if (!dim && !n.superseded) {
          ctx.shadowColor = style.glow;
          ctx.shadowBlur = 10 + r;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = style.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // unlinked (no embedding) → hollow ring instead of filled glow dot
        if (n.unlinked && !dim) {
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = "#0a0a0c";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = style.color;
          ctx.stroke();
        }

        if (n.id === sel || (hover && hover === n.id)) {
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(x, y, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = "#eef4f6";
          ctx.lineWidth = 1.3;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        const showLabel =
          !dim &&
          (n.r >= 9 ||
            cam.scale > 1.3 ||
            n.id === sel ||
            hover === n.id ||
            (focus != null && focus.has(n.id)));
        if (showLabel) {
          ctx.font = "10px var(--font-mono, monospace)";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = "#c8d1d6";
          const label = n.label.length > 26 ? n.label.slice(0, 25) + "…" : n.label;
          ctx.fillText(label, x, y + r + 4);
        }
      }
      ctx.globalAlpha = 1;
    };

    const hitTest = (sx: number, sy: number): SimNode | null => {
      const N = nodesRef.current;
      const cam = camRef.current;
      let best: SimNode | null = null;
      let bd = 18;
      for (const n of N) {
        if (!visible(n)) continue;
        const [px, py] = w2s(n.x, n.y);
        const d = Math.hypot(px - sx, py - sy);
        const hitR = Math.max(n.r * cam.scale + 6, 10);
        if (d < hitR && d < bd) {
          bd = d;
          best = n;
        }
      }
      return best;
    };

    // ---- interactions (pointer events → mouse + touch) ----
    let down = false;
    let moved = false;
    let sx0 = 0;
    let sy0 = 0;
    let lastX = 0;
    let lastY = 0;
    let dragNode: SimNode | null = null;

    const localPos = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    const onDown = (e: PointerEvent) => {
      const [mx, my] = localPos(e);
      down = true;
      moved = false;
      sx0 = mx;
      sy0 = my;
      lastX = mx;
      lastY = my;
      dragNode = hitTest(mx, my);
      if (dragNode) {
        dragNode.fixed = true;
        draggingRef.current = true;
      }
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      const [mx, my] = localPos(e);
      if (down) {
        if (!moved && Math.hypot(mx - sx0, my - sy0) > 4) moved = true;
        if (dragNode) {
          const [wx, wy] = s2w(mx, my);
          dragNode.x = wx;
          dragNode.y = wy;
          dragNode.vx = 0;
          dragNode.vy = 0;
          reheat(0.4);
        } else {
          const cam = camRef.current;
          cam.x -= (mx - lastX) / cam.scale;
          cam.y -= (my - lastY) / cam.scale;
        }
        lastX = mx;
        lastY = my;
      } else {
        const hit = hitTest(mx, my);
        hoverRef.current = hit ? hit.id : null;
        canvas.style.cursor = hit ? "pointer" : "grab";
      }
    };
    const onUp = (e: PointerEvent) => {
      if (down && !moved) {
        const [mx, my] = localPos(e);
        const hit = hitTest(mx, my);
        setSelected(hit ? hit.id : null);
      }
      if (dragNode) {
        dragNode.fixed = false;
        reheat(0.3);
      }
      down = false;
      dragNode = null;
      draggingRef.current = false;
      canvas.style.cursor = hoverRef.current ? "pointer" : "grab";
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const [wx, wy] = s2w(mx, my);
      const cam = camRef.current;
      const k = Math.exp(-e.deltaY * 0.0014);
      cam.scale = Math.min(3.4, Math.max(0.25, cam.scale * k));
      const [nx, ny] = s2w(mx, my);
      cam.x += wx - nx;
      cam.y += wy - ny;
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    resize();
    for (let i = 0; i < SIM.prewarm; i++) tick();
    fit();

    // If the flex layout hadn't resolved a real size by mount, the fit above
    // ran against a 0×0 canvas — refit once the panel reports real dimensions.
    let didInitialFit = sizeRef.current.w > 0;
    const ro = new ResizeObserver(() => {
      resize();
      if (!didInitialFit && sizeRef.current.w > 0) {
        fit();
        didInitialFit = true;
      }
    });
    ro.observe(panel);

    const loop = () => {
      if (draggingRef.current || alphaRef.current > 0.02) {
        tick();
        if (!draggingRef.current) alphaRef.current *= 0.985;
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      fitRef.current = null;
    };
    // Rebuild the loop only when the graph identity changes; render-state is
    // read live through viewRef so selection/search/filters don't re-init.
  }, [graph, adjacency, reheat]);

  // Filtering/search/selection are purely visual (hidden nodes still exert
  // forces), so they don't reheat the sim — the layout stays put while you
  // explore. Only dragging reheats (see the pointer handlers).
  const toggleKind = useCallback((k: MemoryKind) => {
    setHidden((h) => ({ ...h, [k]: !h[k] }));
  }, []);

  const selNode = selected ? nodeById.get(selected) ?? null : null;
  const selLinks = selected ? adjacency.get(selected) ?? [] : [];
  // hasEmbedding is only tracked for active rows; superseded rows are never
  // "unlinked" in the needs-re-embed sense.
  const selUnlinked = selNode
    ? selNode.status === "active" && !selNode.hasEmbedding
    : false;

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-edge bg-surface/60 font-mono text-sm text-fg-dim">
        // no memories yet — Jarvis records facts as you chat
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim sm:inline">
          // memory graph
        </span>
        <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-sm border border-edge bg-surface px-3 py-1.5 sm:max-w-xs">
          <span className="text-accent">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search memory… (key, value, kind)"
            className="w-full bg-transparent font-mono text-[12px] text-fg outline-none placeholder:text-fg-dim"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="font-mono text-[10px] tracking-wider text-fg-dim hover:text-fg"
            >
              CLEAR
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
          <span>
            <span className="text-fg">{graph.stats.total}</span> nodes
          </span>
          <span>
            <span className="text-fg">{graph.stats.semanticEdges + graph.stats.supersedeEdges}</span> edges
          </span>
          {graph.stats.unlinked > 0 && (
            <span className="text-fg-dim">{graph.stats.unlinked} unlinked</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <ToolbarBtn onClick={() => zoomBy(1 / 1.2)}>−</ToolbarBtn>
          <ToolbarBtn onClick={() => zoomBy(1.2)}>+</ToolbarBtn>
          <ToolbarBtn onClick={() => fitRef.current?.()}>⤢ FIT</ToolbarBtn>
        </div>
      </div>

      {/* body: canvas + rail */}
      <div className="flex min-h-0 flex-1 gap-3">
        <div
          ref={panelRef}
          className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border border-edge"
          style={{
            background:
              "radial-gradient(circle at 50% 42%, #0c1418 0%, #08090c 72%)",
          }}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

          {/* legend */}
          <div className="pointer-events-auto absolute bottom-3 left-3 min-w-[168px] rounded-sm border border-edge bg-base/80 p-3 backdrop-blur">
            <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-fg-dim">
              // kinds
            </div>
            <div className="flex flex-col gap-1">
              {MEMORY_KINDS.map((k) => {
                const off = hidden[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleKind(k)}
                    className="flex items-center gap-2 text-left"
                    style={{ opacity: off ? 0.3 : 1 }}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background: KIND_STYLE[k].color,
                        boxShadow: off ? "none" : `0 0 6px ${KIND_STYLE[k].glow}`,
                      }}
                    />
                    <span className="flex-1 font-mono text-[11px] text-fg-muted">
                      {KIND_STYLE[k].label}
                    </span>
                    <span className="font-mono text-[10px] text-fg-dim">
                      {kindCounts[k] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* hint */}
          <div className="pointer-events-none absolute bottom-3 right-3 text-right font-mono text-[9px] leading-relaxed text-fg-dim">
            drag node · drag canvas to pan · scroll to zoom
            <br />
            click node to inspect · click empty to deselect
          </div>
        </div>

        {/* context rail */}
        <aside className="hidden w-[300px] shrink-0 flex-col overflow-hidden rounded-md border border-edge bg-surface/60 md:flex lg:w-[340px]">
          <div className="flex h-8 items-center gap-2 border-b border-edge px-4 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            <span className="text-accent">◆</span>
            <span>ctx · memory graph</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {selNode ? (
              <div className="border-b border-edge p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="rounded-sm border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                    style={{
                      color: KIND_STYLE[selNode.kind].color,
                      borderColor: "var(--color-edge)",
                    }}
                  >
                    {selNode.kind}
                  </span>
                  <span className="font-mono text-[9px] tracking-wider text-fg-dim">
                    #{selNode.id.slice(0, 8)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="ml-auto font-mono text-[10px] text-fg-dim hover:text-fg"
                  >
                    × close
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className="h-8 w-8 shrink-0 rounded-full"
                    style={{
                      background: KIND_STYLE[selNode.kind].color,
                      boxShadow: `0 0 14px ${KIND_STYLE[selNode.kind].glow}`,
                    }}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm font-semibold text-fg">
                      {selNode.key}
                    </div>
                    <div className="font-mono text-[10px] text-fg-dim">
                      {selNode.status === "superseded" ? "superseded" : selNode.source}
                      {selNode.pinned ? " · pinned" : ""}
                      {selUnlinked ? " · no embedding" : ""}
                    </div>
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-fg-muted">
                  {selNode.value}
                </p>

                <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-edge bg-edge">
                  {[
                    ["confidence", selNode.confidence],
                    ["used", `${selNode.used_count}×`],
                    ["last used", fmtRel(selNode.last_used_at)],
                    ["created", fmtRel(selNode.created_at)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-3 bg-surface px-3 py-2">
                      <span className="w-20 shrink-0 font-mono text-[11px] text-fg-dim">
                        {k}
                      </span>
                      <span className="font-mono text-[12px] text-fg-muted">{v}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 mb-2 flex items-center gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-fg-dim">
                    // linked records
                  </span>
                  <span className="rounded-sm border border-edge px-1.5 font-mono text-[10px] text-accent">
                    {selLinks.length}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {selLinks.length === 0 && (
                    <div className="font-mono text-[11px] text-fg-dim">
                      // no links — {selUnlinked ? "needs re-embedding" : "below similarity floor"}
                    </div>
                  )}
                  {selLinks.map((ln) => {
                    const t = nodeById.get(ln.id);
                    if (!t) return null;
                    return (
                      <button
                        key={ln.id}
                        type="button"
                        onClick={() => setSelected(ln.id)}
                        className="flex items-center gap-2 rounded-sm border border-edge/60 bg-surface px-2.5 py-2 text-left hover:border-edge hover:bg-surface-2"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: KIND_STYLE[t.kind].color }}
                        />
                        <span className="flex-1 truncate font-mono text-[12px] text-fg-muted">
                          {t.key}
                        </span>
                        <span className="font-mono text-[9px] text-fg-dim">
                          {ln.type === "supersede" ? "↺" : ln.weight.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="border-b border-edge px-6 py-8 text-center">
                <div
                  className="mx-auto mb-5 h-7 w-7 rotate-45 border-2"
                  style={{ borderColor: "var(--color-accent)", opacity: 0.85 }}
                />
                <p className="font-mono text-[12px] leading-relaxed text-fg-muted">
                  This is <span className="text-accent">Jarvis&rsquo; memory</span> —
                  every stored fact drawn as a living graph. Nodes are memories,
                  coloured by kind; edges link semantically similar facts.
                </p>
                <p className="mt-3 font-mono text-[11px] leading-relaxed text-fg-dim">
                  Click any node to inspect it and trace its connections. Toggle
                  kinds in the legend to isolate a layer.
                </p>
              </div>
            )}

            {/* filters */}
            <div className="p-4">
              <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-fg-dim">
                // filter kinds
              </div>
              <div className="flex flex-col gap-px overflow-hidden rounded-sm border border-edge bg-edge">
                {MEMORY_KINDS.map((k) => {
                  const off = hidden[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleKind(k)}
                      className="flex items-center gap-2.5 bg-surface px-3 py-2 text-left hover:bg-surface-2"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: KIND_STYLE[k].color, opacity: off ? 0.3 : 1 }}
                      />
                      <span
                        className="flex-1 font-mono text-[12px]"
                        style={{ color: off ? "var(--color-fg-dim)" : "var(--color-fg-muted)" }}
                      >
                        {KIND_STYLE[k].label}
                      </span>
                      <span className="font-mono text-[10px] text-fg-dim">
                        {kindCounts[k] ?? 0}
                      </span>
                      <span
                        className="rounded-sm border px-1.5 font-mono text-[9px] tracking-wider"
                        style={{
                          color: off ? "var(--color-fg-dim)" : "var(--color-success)",
                          borderColor: "var(--color-edge)",
                        }}
                      >
                        {off ? "OFF" : "ON"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {graph.stats.superseded > 0 && (
                <button
                  type="button"
                  onClick={() => setHideSuperseded((v) => !v)}
                  className="mt-2 flex w-full items-center gap-2.5 rounded-sm border border-edge bg-surface px-3 py-2 text-left hover:bg-surface-2"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border"
                    style={{ borderColor: `rgb(${EDGE_SUPERSEDE})`, opacity: hideSuperseded ? 0.3 : 1 }}
                  />
                  <span className="flex-1 font-mono text-[12px] text-fg-muted">
                    superseded chains
                  </span>
                  <span className="font-mono text-[10px] text-fg-dim">
                    {graph.stats.superseded}
                  </span>
                  <span
                    className="rounded-sm border border-edge px-1.5 font-mono text-[9px] tracking-wider"
                    style={{ color: hideSuperseded ? "var(--color-fg-dim)" : "var(--color-warn)" }}
                  >
                    {hideSuperseded ? "OFF" : "ON"}
                  </span>
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ToolbarBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 items-center justify-center rounded-sm border border-edge px-2.5 font-mono text-[12px] text-fg-muted transition-colors hover:border-accent-dim hover:text-accent"
    >
      {children}
    </button>
  );
}
