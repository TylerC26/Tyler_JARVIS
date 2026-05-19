import { MobileNavMenu } from "./MobileNavMenu";
import { Clock } from "./Clock";
import { StatusRail } from "./StatusRail";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-edge bg-base/80 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <MobileNavMenu />
        <span className="md:hidden font-mono text-sm text-accent">◢◤</span>
        <span className="md:hidden font-mono text-xs tracking-[0.2em]">
          JARVIS
        </span>
        <span className="hidden md:inline font-mono text-[10px] uppercase tracking-wider text-fg-dim">
          // command center
        </span>
      </div>

      <div className="flex items-center gap-6">
        <StatusRail />
        <Clock />
      </div>
    </header>
  );
}
