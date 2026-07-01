"use client";

import { linkHost, platformFor, type PlatformTone } from "@/lib/projects/platforms";
import { RailCard } from "./RailCard";
import type { ProjectLink } from "@/lib/db/types";

const TONE_CLASS: Record<PlatformTone, string> = {
  warn: "border-warn/40 text-warn hover:bg-warn/10",
  info: "border-info/40 text-info hover:bg-info/10",
  accent: "border-accent/40 text-accent hover:bg-accent/10",
  success: "border-success/40 text-success hover:bg-success/10",
  danger: "border-danger/40 text-danger hover:bg-danger/10",
  neutral: "border-edge text-fg-muted hover:bg-surface-2 hover:text-fg",
};

type Tile = { platform: string; label: string; url: string };

// External-software quick-launch for the v2 right rail. Same data + tone
// mapping as the old LaunchBar, stacked full-width to fit the narrow rail. The
// legacy github_repo_url folds in as an implicit GitHub tile.
export function SoftwareRail({
  links,
  githubRepoUrl,
}: {
  links: ProjectLink[];
  githubRepoUrl: string | null;
}) {
  const tiles: Tile[] = links.map((l) => ({
    platform: l.platform,
    label: l.label || platformFor(l.platform).label,
    url: l.url,
  }));
  if (githubRepoUrl) {
    tiles.push({ platform: "custom", label: "GitHub", url: githubRepoUrl });
  }

  return (
    <RailCard label="// SOFTWARE">
      {tiles.length === 0 ? (
        <div className="font-mono text-[11px] leading-relaxed text-fg-dim">
          no external links yet — add Procore / CxAlloy / custom via EDIT
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tiles.map((t, i) => {
            const tone = platformFor(t.platform).tone;
            return (
              <a
                key={`${t.url}-${i}`}
                href={t.url}
                target="_blank"
                rel="noreferrer noopener"
                className={[
                  "group flex flex-col gap-0.5 rounded-sm border bg-surface-2/40 px-3 py-2 transition-colors",
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
    </RailCard>
  );
}
