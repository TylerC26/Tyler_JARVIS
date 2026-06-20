// /progress — timeline of body-progress photos, newest first. Server
// component: photos come from the PRIVATE bucket, so every thumbnail URL is a
// fresh short-lived signed URL minted at render (never persisted). Weight is
// matched by calendar day from body_metrics. Copy is trend-framed on purpose
// — no absolute body-fat claims (see the physique analyzer's framing rules).
//
// Gating matches the rest of (app): single-user local mode — server-side
// owner scoping + RLS are the protection layer; route-level login lands when
// the app's real auth does (see app/(auth)/login).

import { PageHeader } from "@/components/ui/PageHeader";
import { DeletePhotoButton } from "@/components/modules/progress/DeletePhotoButton";
import {
  WeightCard,
  type WeightEntry,
} from "@/components/modules/progress/WeightCard";
import { listBodyMetrics } from "@/lib/db/core/body-metrics";
import { listProgressPhotos } from "@/lib/db/core/progress-photos";
import {
  calcMovingAvgKg,
  extractPhotoDelta,
} from "@/lib/db/core/body-metrics-trends";
import { signProgressPhotoUrl } from "@/lib/storage/progress-photos";
import { getOwnerTz } from "@/lib/auth/currentUser";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 60;

type Card = {
  id: string;
  takenAt: string;
  signedUrl: string | null;
  trend: string | null;
  impression: string | null;
  lighting: string | null;
  weightKg: number | null;
};

function dayOf(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function prettyDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

async function loadCards(): Promise<Card[]> {
  const photos = await listProgressPhotos({ limit: PAGE_LIMIT });
  if (photos.length === 0) return [];
  const tz = getOwnerTz();

  // Weight on the photo's day: first weigh-in of that calendar day wins.
  const oldest = photos[photos.length - 1].taken_at;
  const metrics = await listBodyMetrics({ since: oldest });
  const weightByDay = new Map<string, number>();
  for (const m of metrics) {
    const day = dayOf(m.recorded_at, tz);
    if (!weightByDay.has(day)) weightByDay.set(day, Number(m.weight_kg));
  }

  return Promise.all(
    photos.map(async (p) => {
      const a = (p.analysis ?? {}) as Record<string, unknown>;
      return {
        id: p.id,
        takenAt: p.taken_at,
        signedUrl: await signProgressPhotoUrl(p.storage_path),
        trend: extractPhotoDelta(p.analysis),
        impression:
          typeof a.overall_impression === "string"
            ? a.overall_impression
            : null,
        lighting:
          typeof a.lighting_quality === "string" ? a.lighting_quality : null,
        weightKg: weightByDay.get(dayOf(p.taken_at, tz)) ?? null,
      };
    }),
  );
}

type WeightSummary = {
  latestKg: number | null;
  latestAt: string | null;
  avg7: number | null;
  avg28: number | null;
  entries: WeightEntry[];
};

const RECENT_WEIGH_INS = 30;

async function loadWeight(): Promise<WeightSummary> {
  // Weigh-in volumes are tiny (a dense year is ~365 rows — see body-metrics
  // header), so one unbounded fetch covers both the trailing averages and the
  // recent list. listBodyMetrics is oldest-first.
  const metrics = await listBodyMetrics();
  if (metrics.length === 0) {
    return { latestKg: null, latestAt: null, avg7: null, avg28: null, entries: [] };
  }

  const series = metrics.map((m) => ({
    recorded_at: m.recorded_at,
    weight_kg: Number(m.weight_kg),
  }));
  const now = new Date();
  const a7 = calcMovingAvgKg(series, 7, now);
  const a28 = calcMovingAvgKg(series, 28, now);
  const latest = metrics[metrics.length - 1];

  const entries: WeightEntry[] = [...metrics]
    .reverse()
    .slice(0, RECENT_WEIGH_INS)
    .map((m) => ({
      id: m.id,
      weight_kg: Number(m.weight_kg),
      bf_percent: m.bf_percent != null ? Number(m.bf_percent) : null,
      recorded_at: m.recorded_at,
    }));

  return {
    latestKg: Number(latest.weight_kg),
    latestAt: latest.recorded_at,
    avg7: a7?.avg_kg ?? null,
    avg28: a28?.avg_kg ?? null,
    entries,
  };
}

export default async function ProgressPage() {
  const [cards, weight] = await Promise.all([loadCards(), loadWeight()]);
  const tz = getOwnerTz();

  return (
    <div>
      <PageHeader
        code="PRG-09"
        title="Progress"
        subtitle="Photo timeline — every read is a trend vs the prior photo, not a verdict."
      />

      <WeightCard
        latestKg={weight.latestKg}
        latestAt={weight.latestAt}
        avg7={weight.avg7}
        avg28={weight.avg28}
        entries={weight.entries}
        tz={tz}
      />

      {cards.length === 0 ? (
        <div className="rounded-sm border border-edge bg-surface-2/40 p-6 font-mono text-sm text-fg-muted">
          No progress photos yet. Send Matt a photo on Telegram or /chat
          (caption it &quot;progress pic&quot;) and it lands here.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {cards.map((c) => (
            <li
              key={c.id}
              className="rounded-sm border border-edge bg-surface-2/40 p-3 transition-colors hover:bg-surface-2/70"
            >
              <div className="flex gap-4">
                {c.signedUrl ? (
                  // Plain <img>: the src is a short-lived signed URL into the
                  // private bucket — next/image caching would outlive it.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.signedUrl}
                    alt={`Progress photo, ${prettyDate(c.takenAt, tz)}`}
                    className="size-24 shrink-0 rounded-sm border border-edge bg-surface object-cover"
                  />
                ) : (
                  <div className="grid size-24 shrink-0 place-items-center rounded-sm border border-edge bg-surface font-mono text-[10px] text-fg-dim">
                    no image
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3 border-b border-edge/40 pb-1">
                    <span className="font-mono text-xs font-semibold text-fg">
                      {prettyDate(c.takenAt, tz)}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim">
                        {c.weightKg != null ? `${c.weightKg} kg that day` : "no weigh-in that day"}
                      </span>
                      <DeletePhotoButton id={c.id} label={prettyDate(c.takenAt, tz)} />
                    </div>
                  </div>

                  <div className="mt-2 space-y-1 font-mono text-xs leading-relaxed">
                    {c.trend ? (
                      <p className="text-accent">↳ {c.trend}</p>
                    ) : (
                      <p className="text-fg-dim">
                        ↳ baseline photo — no prior to compare
                      </p>
                    )}
                    {c.impression && (
                      <p className="text-fg-muted">{c.impression}</p>
                    )}
                    {(c.lighting === "poor" || c.lighting === "fair") && (
                      <p className="text-[10px] uppercase tracking-wider text-fg-dim">
                        {c.lighting} lighting — read loosely
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
