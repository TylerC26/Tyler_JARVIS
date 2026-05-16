// Vercel-side mirror of the daemon's TOML allowlist. Lets the chat tool tell
// the LLM which projects can be dispatched and resolves a slug → absolute path
// before insert. This is convenience, not security: the Mac daemon's TOML is
// the authoritative gate (it re-validates on every task).
//
// Source order:
//   1. JARVIS_REPO_PATHS env var — JSON object {slug: path}
//   2. Built-in default for the Jarvis repo itself (so the system works even
//      without any env config — single-user MVP).

const BUILTIN: Record<string, string> = {
  jarvis: "/Users/tylerc/Dev/Jarvis",
};

let cached: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (cached) return cached;
  const raw = process.env.JARVIS_REPO_PATHS;
  if (!raw) {
    cached = { ...BUILTIN };
    return cached;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    cached = { ...BUILTIN, ...parsed };
  } catch {
    cached = { ...BUILTIN };
  }
  return cached;
}

export function listAllowedRepoSlugs(): string[] {
  return Object.keys(load());
}

export function resolveRepoSlugToPath(slug: string): string | null {
  return load()[slug.toLowerCase()] ?? null;
}

// Best-effort fuzzy match: exact slug, then case-insensitive contains. Used
// when the LLM passes a free-form `project` argument.
export function resolveRepoFuzzy(input: string): { slug: string; path: string } | null {
  const all = load();
  const norm = input.trim().toLowerCase();
  if (norm in all) return { slug: norm, path: all[norm] };
  for (const [slug, path] of Object.entries(all)) {
    if (slug.includes(norm) || norm.includes(slug)) return { slug, path };
  }
  return null;
}
