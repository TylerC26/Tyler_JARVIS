"use client";

import { useMemo, useState } from "react";
import {
  deletePlaceAction,
  updatePlaceAction,
} from "@/app/(app)/places/actions";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  PLACE_CATEGORIES,
  type Place,
  type PlaceStatus,
} from "@/lib/db/types";

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
  const [places, setPlaces] = useState<Place[]>(initialPlaces);
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

  // Group filtered places by AREA — the useful unit when most places sit in
  // one city (e.g. Hong Kong districts: Central, TST, Wan Chai…). Falls back
  // to city, then "Unsorted", so nothing is hidden.
  function groupKey(p: Place): string {
    return p.area?.trim() || p.city?.trim() || "Unsorted";
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Place[]>();
    for (const p of filtered) {
      const key = groupKey(p);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "Unsorted") return 1;
      if (b === "Unsorted") return -1;
      return a.localeCompare(b);
    });
  }, [filtered]);

  const wantCount = places.filter((p) => p.status === "want_to_go").length;
  const areaCount = useMemo(
    () => new Set(places.map(groupKey)).size,
    [places],
  );

  async function handleSave(
    place: Place,
    patch: Parameters<typeof updatePlaceAction>[1],
  ): Promise<boolean> {
    const result = await updatePlaceAction(place.id, patch);
    if (!result.ok) {
      alert(result.error);
      return false;
    }
    setPlaces((prev) =>
      prev.map((p) => (p.id === place.id ? result.data : p)),
    );
    return true;
  }

  async function handleDelete(place: Place) {
    if (!confirm(`Delete "${place.name}" from your places?`)) return;
    const result = await deletePlaceAction(place.id);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    setPlaces((prev) => prev.filter((p) => p.id !== place.id));
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        code="PLC"
        title="Places"
        subtitle={`${places.length} saved · ${wantCount} want-to-go · ${areaCount} ${areaCount === 1 ? "area" : "areas"}`}
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
          grouped.map(([area, list]) => (
            <section key={area} className="space-y-2">
              <h2 className="font-mono text-[10px] uppercase tracking-widest text-fg-dim border-b border-edge/40 pb-1">
                // {area} ({list.length})
              </h2>
              <div className="space-y-2">
                {list.map((place) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    onSave={(patch) => handleSave(place, patch)}
                    onDelete={() => handleDelete(place)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

type EditPatch = Parameters<typeof updatePlaceAction>[1];

type CardProps = {
  place: Place;
  onSave: (patch: EditPatch) => Promise<boolean>;
  onDelete: () => void;
};

function PlaceCard({ place, onSave, onDelete }: CardProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <PlaceEditForm
        place={place}
        onCancel={() => setEditing(false)}
        onDelete={onDelete}
        onSave={async (patch) => {
          const ok = await onSave(patch);
          if (ok) setEditing(false);
          return ok;
        }}
      />
    );
  }

  const catTone = CATEGORY_TONE[place.category] ?? "text-fg-dim";
  const meta = [place.cuisine, place.city].filter(Boolean).join(" · ");

  return (
    <div className="group rounded-sm border border-edge bg-surface-2/40 px-4 py-3 flex flex-col gap-1.5">
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
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            // Persistently visible (dimmed) so the affordance exists on touch
            // where there's no hover state.
            className="flex min-h-[44px] items-center rounded-sm px-2 font-mono text-[10px] uppercase tracking-wider text-fg-dim opacity-60 hover:opacity-100 hover:text-accent active:bg-accent/10 transition-opacity"
          >
            edit
          </button>
          <span
            className={[
              "rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
              STATUS_TONE[place.status],
            ].join(" ")}
          >
            {STATUS_LABEL[place.status]}
          </span>
        </div>
      </div>

      {(meta || place.price_level) && (
        <div className="flex items-center gap-3 font-mono text-[11px] text-fg-muted">
          {meta && <span className="truncate">{meta}</span>}
          {priceGlyphs(place.price_level)}
        </div>
      )}

      {place.address && (
        <p className="font-mono text-[11px] text-fg-muted leading-relaxed">
          {place.address}
        </p>
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

const PRICE_OPTIONS = [
  { value: "", label: "—" },
  { value: "1", label: "$" },
  { value: "2", label: "$$" },
  { value: "3", label: "$$$" },
  { value: "4", label: "$$$$" },
];

function PlaceEditForm({
  place,
  onSave,
  onCancel,
  onDelete,
}: {
  place: Place;
  onSave: (patch: EditPatch) => Promise<boolean>;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState({
    name: place.name,
    category: place.category as string,
    status: place.status as PlaceStatus,
    cuisine: place.cuisine ?? "",
    city: place.city ?? "",
    area: place.area ?? "",
    address: place.address ?? "",
    price_level: place.price_level ? String(place.price_level) : "",
    notes: place.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    const ok = await onSave({
      name: form.name,
      category: form.category,
      status: form.status,
      cuisine: form.cuisine,
      city: form.city,
      area: form.area,
      address: form.address,
      price_level: form.price_level ? Number(form.price_level) : null,
      notes: form.notes,
    });
    setSaving(false);
    if (!ok) setError("Save failed — try again.");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-sm border border-accent/30 bg-surface-2/60 p-4 space-y-3"
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
        // edit place
      </p>

      <Field label="Name">
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          required
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Category">
          <Select
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
          >
            {PLACE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={form.status}
            onChange={(e) => set("status", e.target.value as PlaceStatus)}
          >
            {(["want_to_go", "scheduled", "visited"] as PlaceStatus[]).map(
              (s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field label="Cuisine / vibe">
          <Input
            value={form.cuisine}
            onChange={(e) => set("cuisine", e.target.value)}
            placeholder="italian, omakase…"
          />
        </Field>
        <Field label="Price">
          <Select
            value={form.price_level}
            onChange={(e) => set("price_level", e.target.value)}
          >
            {PRICE_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="City">
          <Input
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
          />
        </Field>
        <Field label="Area / neighborhood">
          <Input
            value={form.area}
            onChange={(e) => set("area", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Address">
        <Input
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
        />
      </Field>

      <Field label="Notes">
        <Textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          placeholder="why you saved it, what to order…"
        />
      </Field>

      {error && <p className="font-mono text-[11px] text-danger">{error}</p>}

      <div className="flex items-center justify-between">
        <Button type="button" variant="danger" size="sm" onClick={onDelete}>
          delete
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? "saving…" : "save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
