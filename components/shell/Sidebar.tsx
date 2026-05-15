"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  code: string;
  glyph: string;
  status?: "live" | "offline";
};

type NavSection = {
  label: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "overview",
    items: [
      { href: "/", label: "Dashboard", code: "DSH", glyph: "◈", status: "live" },
    ],
  },
  {
    label: "life",
    items: [
      { href: "/calendar", label: "Calendar", code: "CAL", glyph: "▦", status: "live" },
    ],
  },
  {
    label: "work",
    items: [
      { href: "/tasks", label: "Tasks", code: "TSK", glyph: "▤", status: "live" },
      { href: "/projects", label: "Projects", code: "PRJ", glyph: "⌬", status: "live" },
    ],
  },

  {
    label: "ai",
    items: [
      { href: "/assistant", label: "Assistant", code: "AI ", glyph: "◊", status: "live" },
      { href: "/chat", label: "Chat", code: "CHT", glyph: "◢", status: "live" },
      { href: "/agents", label: "Agents", code: "AGT", glyph: "◔", status: "live" },
      { href: "/memory", label: "Memory", code: "MEM", glyph: "◐", status: "live" },
      { href: "/skills", label: "Skills", code: "SKL", glyph: "✦", status: "live" },
      { href: "/tools", label: "Tools", code: "TLS", glyph: "◎", status: "live" },
      { href: "/cron", label: "Cron Jobs", code: "CRN", glyph: "⏲", status: "live" },
    ],
  },
  {
    label: "system",
    items: [
      { href: "/settings", label: "Settings", code: "SET", glyph: "◇", status: "live" },
    ],
  },
];

// Flat list preserved for MobileTabBar and any external consumers.
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex h-screen w-60 shrink-0 flex-col border-r border-edge bg-surface/60 backdrop-blur-sm">
      <div className="flex h-14 items-center gap-2 border-b border-edge px-4">
        <span className="font-mono text-accent text-sm">◢◤</span>
        <span className="font-mono text-sm font-semibold tracking-[0.2em]">
          JARVIS
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_SECTIONS.map((section, idx) => (
          <div key={section.label} className={idx === 0 ? "" : "mt-4"}>
            <div className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
              // {section.label}
            </div>
            <ul className="mt-1 flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={[
                        "group flex items-center gap-3 rounded-sm px-3 py-2 font-mono text-xs transition-colors",
                        active
                          ? "bg-accent/10 text-accent"
                          : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "w-4 text-center text-base leading-none",
                          active ? "text-accent" : "text-fg-dim group-hover:text-fg-muted",
                        ].join(" ")}
                        aria-hidden
                      >
                        {item.glyph}
                      </span>
                      <span className="tracking-wider">{item.code}</span>
                      <span className="ml-1 normal-case tracking-normal text-[11px]">
                        {item.label}
                      </span>
                      {item.status === "offline" && (
                        <span className="ml-auto rounded-sm bg-edge px-1 text-[9px] text-fg-dim">
                          P2
                        </span>
                      )}
                      {active && (
                        <span className="ml-auto text-accent text-base">›</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-edge p-3">
        <div className="flex items-center gap-2 rounded-sm bg-surface-2 px-2 py-1.5">
          <div className="size-6 rounded-sm bg-accent/20 text-accent grid place-items-center font-mono text-[10px]">
            T
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-[11px]">tyler</span>
            <span className="font-mono text-[9px] text-fg-dim uppercase">
              owner
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  // Only show the live modules in the mobile tab bar to avoid crowding
  const items = NAV_ITEMS.filter((i) => i.status !== "offline");

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-edge bg-surface/95 backdrop-blur">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "flex flex-col items-center justify-center gap-0.5 py-2 font-mono text-[10px]",
              active ? "text-accent" : "text-fg-muted",
            ].join(" ")}
          >
            <span className="text-base leading-none">{item.glyph}</span>
            <span className="tracking-wider">{item.code}</span>
          </Link>
        );
      })}
    </nav>
  );
}
