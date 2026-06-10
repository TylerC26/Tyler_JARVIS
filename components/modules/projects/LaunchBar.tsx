"use client";

import { linkHost, platformFor, type PlatformTone } from "@/lib/projects/platforms";
import type { ProjectLink } from "@/lib/db/types";

// tone → chip classes, mirroring StatusBadge's palette so the launch tiles read
// as the same design language without new CSS.
const TONE_CLASS: Record<PlatformTone, string> = {
  warn: "border-warn/40 text-warn hover:bg-warn/10",
  info: "border-info/40 text-info hover:bg-info/10",
  accent: "border-accent/40 text-accent hover:bg-accent/10",
  success: "border-success/40 text-success hover:bg-success/10",
  danger: "border-danger/40 text-danger hover:bg-danger/10",
  neutral: "border-edge text-fg-muted hover:bg-surface-2 hover:text-fg",
};

type Tile = { platform: string; label: string; url: string };

// The launch bar shows every external-software link as a click-to-open tile.
// The legacy `github_repo_url` is folded in as an implicit GitHub tile so the
// repo link isn't lost in the rework.
export function LaunchBar({
  links,
  githubRepoUrl,
}: {
  links: ProjectLink[];
  githubRepoUrl: string | null;
}) {
  const tiles: Tile[] = [
    ...links.map((l) => ({
      platform: l.platform,
      label: l.label || platformFor(l.platform).label,
      url: l.url,
    })),
  ];
  if (githubRepoUrl) {
    tiles.push({ platform: "custom", label: "GitHub", url: githubRepoUrl });
  }

  return (
    <section className="mb-5">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
        // software
      </div>
      {tiles.length === 0 ? (
        <div className="rounded-md border border-dashed border-edge bg-surface/20 px-3 py-3 font-mono text-[11px] text-fg-dim">
          no external links yet — add Procore / CxAlloy / custom via EDIT
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tiles.map((t, i) => {
            const tone = platformFor(t.platform).tone;
            return (
              <a
                key={`${t.url}-${i}`}
                href={t.url}
                target="_blank"
                rel="noreferrer noopener"
                className={[
                  "group flex min-w-[140px] flex-col gap-0.5 rounded-md border bg-surface/40 px-3 py-2 transition-colors",
                  TONE_CLASS[tone],
                ].join(" ")}
              >
                <span className="flex items-center justify-between gap-2 font-mono text-[12px] font-semibold uppercase tracking-wider">
                  {t.label}
                  <span aria-hidden className="opacity-60 group-hover:opacity-100">
                    ↗
                  </span>
                </span>
                <span className="truncate font-mono text-[10px] text-fg-dim">
                  {linkHost(t.url)}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
