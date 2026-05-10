import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-sm rounded-md border border-edge bg-surface p-6 font-mono text-sm">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-dim">
          // local-mode
        </div>
        <div className="mb-4 text-base text-accent">
          ◢◤ JARVIS<span className="cursor-blink ml-1">_</span>
        </div>
        <p className="mb-6 text-fg-muted leading-relaxed">
          Single-user local mode is active. Auth is wired but not gating routes
          in v1. Real login lands when RLS flips on.
        </p>
        <Link
          href="/"
          className="block rounded-sm border border-accent/40 bg-accent/10 px-3 py-2 text-center text-accent hover:bg-accent/20 transition-colors"
        >
          ENTER COMMAND CENTER →
        </Link>
      </div>
    </div>
  );
}
