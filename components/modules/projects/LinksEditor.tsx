"use client";

import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { PROJECT_PLATFORMS, platformFor } from "@/lib/projects/platforms";
import type { ProjectLink } from "@/lib/db/types";

// Controlled editor for a project's external-software links. The parent owns
// the `links` array (so it can fold the value into its save patch directly,
// outside the form's FormData). Procore + CxAlloy are presets; "custom" lets
// the label be typed freely.
export function LinksEditor({
  links,
  onChange,
}: {
  links: ProjectLink[];
  onChange: (next: ProjectLink[]) => void;
}) {
  function update(i: number, patch: Partial<ProjectLink>) {
    onChange(links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function remove(i: number) {
    onChange(links.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...links, { platform: "procore", label: "", url: "" }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
        External software
      </div>
      {links.length === 0 && (
        <div className="rounded-sm border border-dashed border-edge px-3 py-2 font-mono text-[10px] text-fg-dim">
          // no links — add Procore, CxAlloy, or a custom URL
        </div>
      )}
      {links.map((link, i) => {
        const isCustom = link.platform === "custom";
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="w-28 shrink-0">
              <Select
                value={link.platform}
                onChange={(e) => update(i, { platform: e.target.value })}
              >
                {PROJECT_PLATFORMS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            {isCustom && (
              <div className="w-32 shrink-0">
                <Input
                  value={link.label}
                  placeholder="label"
                  onChange={(e) => update(i, { label: e.target.value })}
                />
              </div>
            )}
            <Input
              value={link.url}
              placeholder={
                link.platform === "procore"
                  ? "https://app.procore.com/…"
                  : link.platform === "cxalloy"
                    ? "https://…cxalloy.com/…"
                    : "https://…"
              }
              onChange={(e) => update(i, { url: e.target.value })}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove link"
              title="Remove"
              className="grid size-9 shrink-0 place-items-center rounded-sm border border-edge font-mono text-fg-dim hover:border-danger hover:text-danger"
            >
              ✕
            </button>
          </div>
        );
      })}
      <div>
        <Button variant="outline" size="sm" onClick={add}>
          + ADD LINK
        </Button>
      </div>
    </div>
  );
}

// Default label for a saved link when the user didn't type one (presets get
// their platform name). Exported for the save path so blank labels normalize.
export function labelForLink(link: ProjectLink): string {
  return link.label.trim() || platformFor(link.platform).label;
}
