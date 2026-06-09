// Vercel-side mirror of the daemon's TOML allowlist. Lets the chat tool tell
// the LLM which projects can be dispatched and resolves a slug → absolute path
// before insert. This is convenience, not security: the Mac daemon's TOML is
// the authoritative gate (it re-validates on every task).
//
// Two resolution modes:
//   1. Named repos — explicit slug → path map (JARVIS_REPO_PATHS env, JSON
//      {slug: path}) plus the built-in `jarvis` default. Supports fuzzy match.
//   2. Repo roots — any folder directly under an allowed root is dispatchable
//      by its exact folder name, without listing each one. Built-in root is
//      Tyler's dev folder; extend via JARVIS_REPO_ROOTS env (JSON string[]).
//      The Vercel side can't see the Mac filesystem, so it just constructs
//      <root>/<folder> and lets the daemon validate existence + git-repo-ness.

const BUILTIN: Record<string, string> = {
  jarvis: "/Users/tylerc/Dev/Jarvis",
};

const BUILTIN_ROOTS: string[] = ["/Users/tylerc/Dev"];

function stripTrailingSlash(p: string): string {
  return p.replace(/\/+$/, "");
}

export function listRepoRoots(): string[] {
  const raw = process.env.JARVIS_REPO_ROOTS;
  if (!raw) return BUILTIN_ROOTS.map(stripTrailingSlash);
  try {
    const parsed = JSON.parse(raw) as string[];
    return [...BUILTIN_ROOTS, ...parsed].map(stripTrailingSlash);
  } catch {
    return BUILTIN_ROOTS.map(stripTrailingSlash);
  }
}

// A `project` arg is safe to splice into a path only if it's a single, plain
// folder segment — no separators, no traversal. Anything else returns null and
// the caller falls through (no root match).
function sanitizeSegment(input: string): string | null {
  const seg = stripTrailingSlash(input.trim());
  if (!seg || seg === "." || seg === "..") return null;
  if (!/^[A-Za-z0-9._-]+$/.test(seg)) return null;
  return seg;
}

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

// Resolve a free-form `project` arg to an absolute repo path. Order:
//   1. exact named-slug match
//   2. case-insensitive contains match against named slugs
//   3. root fallback — treat the arg as a folder name directly under the first
//      configured root (e.g. "Redzone" → /Users/tylerc/Dev/Redzone). The daemon
//      re-validates that the parent is an allowed root and the dir is a git repo.
export function resolveRepoFuzzy(input: string): { slug: string; path: string } | null {
  const all = load();
  const norm = input.trim().toLowerCase();
  if (norm in all) return { slug: norm, path: all[norm] };
  for (const [slug, path] of Object.entries(all)) {
    if (slug.includes(norm) || norm.includes(slug)) return { slug, path };
  }
  const seg = sanitizeSegment(input);
  const roots = listRepoRoots();
  if (seg && roots.length > 0) {
    return { slug: seg, path: `${roots[0]}/${seg}` };
  }
  return null;
}
