"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Place, PlaceStatus } from "@/lib/db/types";

type CitySummary = { city: string; count: number };

type Props = {
  initialPlaces: Place[];
  initialCities: CitySummary[];
};

const STATUS_FILTERS: { value: PlaceStatus | "all"; label: string }[] = [
  { value: "all", label: "all" },
  { value: "want_to_go", label: "want to go" },
  { value: "scheduled", label: "scheduled" },
  { value: "visited", label: "visited" },
];

const STATUS_TONE: Record<PlaceStatus, string> = {
  want_to_go: "border-accent/50 bg-accent/10 text-accent",
  scheduled: "border-info/50 bg-info/10 text-info",
  visited: "border-edge bg-surface-2 text-fg-dim",
};

const STATUS_LABEL: Record<PlaceStatus, string> = {
  want_to_go: "want to go",
  scheduled: "scheduled",
  visited: "visited",
};

const CATEGORY_TONE: Record<string, string> = {
  restaurant: "text-accent",
  cafe: "text-warn",
  bar: "text-info",
  dessert: "text-danger",
  activity: "text-success",
  other: "text-fg-dim",
};

function priceGlyphs(level: number | null) {
  if (!level || level < 1) return null;
  const n = Math.min(4, level);
  return (
    <span className="font-mono text-[11px]">
      <span className="text-success">{"$".repeat(n)}</span>
      <span className="text-fg-dim">{"$".repeat(4 - n)}</span>
    </span>
  );
}

export function PlacesView({ initialPlaces, initialCities }: Props) {
  const [places] = useState<Place[]>(initialPlaces);
  const [activeCity, setActiveCity] = useState<string | null>(null);
  const [status, setStatus] = useState<PlaceStatus | "all">("all");
  const [query, setQuery] = useState("");

  // City chips — derived from current places so counts stay honest.
  const cities: CitySummary[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of places) {
      const c = p.city ?? "Unknown";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const ordered = initialCities
      .filter((c) => counts.has(c.city))
      .map((c) => ({ city: c.city, count: counts.get(c.city)! }));
    const seen = new Set(ordered.map((c) => c.city));
    const fresh = [...counts.entries()]
      .filter(([k]) => !seen.has(k))
      .map(([city, count]) => ({ city, count }));
    return [...ordered, ...fresh];
  }, [places, initialCities]);

  const filtered = useMemo(() => {
    let list = places;
    if (status !== "all") list = list.filter((p) => p.status === status);
    if (activeCity)
      list = list.filter((p) => (p.city ?? "Unknown") === activeCity);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        [p.name, p.cuisine, p.area, p.city, p.raw_caption]
          .filter(Boolean)
          .some((f) => f!.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [places, status, activeCity, query]);

  // Group filtered places by city for section headers.
  const grouped = useMemo(() => {
    const map = new Map<string, Place[]>();
    for (const p of filtered) {
      const c = p.city ?? "Unknown";
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(p);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return a.localeCompare(b);
    });
  }, [filtered]);

  const wantCount = places.filter((p) => p.status === "want_to_go").length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        code="PLC"
        title="Places"
        subtitle={`${places.length} saved · ${wantCount} want-to-go · ${cities.length} ${cities.length === 1 ? "city" : "cities"}`}
      />

      <div className="px-6 py-2 flex flex-col gap-2 border-b border-edge/40">
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              type="button"
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={[
                "rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                status === s.value
                  ? "border-accent/60 bg-accent/15 text-accent"
                  : "border-edge text-fg-muted hover:text-fg hover:bg-surface-2",
              ].join(" ")}
            >
              {s.label}
            </button>
          ))}
        </div>
        {cities.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveCity(null)}
              className={[
                "rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                activeCity === null
                  ? "border-accent/60 bg-accent/15 text-accent"
                  : "border-edge text-fg-muted hover:text-fg hover:bg-surface-2",
              ].join(" ")}
            >
              all cities ({places.length})
            </button>
            {cities.map((c) => (
              <button
                type="button"
                key={c.city}
                onClick={() =>
                  setActiveCity((prev) => (prev === c.city ? null : c.city))
                }
                className={[
                  "rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                  activeCity === c.city
                    ? "border-accent/60 bg-accent/15 text-accent"
                    : "border-edge text-fg-muted hover:text-fg hover:bg-surface-2",
                ].join(" ")}
              >
                {c.city} ({c.count})
              </button>
            ))}
          </div>
        )}
        <Input
          placeholder="search places…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-4">
        {filtered.length === 0 ? (
          <div className="grid place-items-center h-48">
            <p className="font-mono text-sm text-fg-dim text-center">
              {places.length === 0
                ? "// no places yet — forward an Instagram or Threads post to the Jarvis Telegram bot"
                : "// no places match this filter"}
            </p>
          </div>
        ) : (
          grouped.map(([city, list]) => (
            <section key={city} className="space-y-2">
              <h2 className="font-mono text-[10px] uppercase tracking-widest text-fg-dim border-b border-edge/40 pb-1">
                // {city} ({list.length})
              </h2>
              <div className="space-y-2">
                {list.map((place) => (
                  <PlaceCard key={place.id} place={place} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function PlaceCard({ place }: { place: Place }) {
  const catTone = CATEGORY_TONE[place.category] ?? "text-fg-dim";
  const meta = [place.cuisine, place.area].filter(Boolean).join(" · ");

  return (
    <div className="rounded-sm border border-edge bg-surface-2/40 px-4 py-3 flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
          <span
            className={[
              "shrink-0 font-mono text-[10px] uppercase tracking-wider",
              catTone,
            ].join(" ")}
          >
            [{place.category}]
          </span>
          {place.source_url ? (
            <a
              href={place.source_url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[14px] text-fg hover:text-accent truncate"
              title={place.name}
            >
              {place.name}
            </a>
          ) : (
            <span className="font-mono text-[14px] text-fg truncate">
              {place.name}
            </span>
          )}
        </div>
        <span
          className={[
            "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
            STATUS_TONE[place.status],
          ].join(" ")}
        >
          {STATUS_LABEL[place.status]}
        </span>
      </div>

      {(meta || place.price_level || place.notes) && (
        <div className="flex items-center gap-3 font-mono text-[11px] text-fg-muted">
          {meta && <span className="truncate">{meta}</span>}
          {priceGlyphs(place.price_level)}
        </div>
      )}

      {place.notes && (
        <p className="font-mono text-[11px] text-fg-dim leading-relaxed">
          {place.notes}
        </p>
      )}

      <div className="flex items-center gap-3 font-mono text-[10px] text-fg-dim">
        {place.source !== "manual" && <span>via {place.source}</span>}
        {place.scheduled_for && <span>· booked {place.scheduled_for}</span>}
        {place.source_url && (
          <a
            href={place.source_url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto hover:text-accent"
          >
            view post ↗
          </a>
        )}
      </div>
    </div>
  );
}
