// Minimal GitHub REST wrapper used by the read_project_repo chat tool. Reads
// only — no writes. Anonymous calls work for public repos; set GITHUB_TOKEN to
// raise the rate limit and reach private repos.

const API = "https://api.github.com";
const RAW_BYTE_CAP = 64 * 1024; // safety cap on any single file body

export type RepoRef = { owner: string; repo: string };

export type GitHubResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Accepts the common forms a user might paste:
//   https://github.com/owner/repo
//   https://github.com/owner/repo.git
//   git@github.com:owner/repo.git
//   github.com/owner/repo
//   owner/repo
export function parseRepoUrl(input: string): RepoRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const cleaned = trimmed
    .replace(/^git@github\.com:/i, "")
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");

  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo] = parts;
  if (!owner || !repo) return null;
  return { owner, repo };
}

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "jarvis-personal-os",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function ghFetch(path: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    headers: authHeaders(),
    // Server-side only — Next.js cache disabled because repo state changes.
    cache: "no-store",
  });
}

async function asJsonOrError<T>(
  res: Response,
): Promise<GitHubResult<T>> {
  if (res.ok) {
    const data = (await res.json()) as T;
    return { ok: true, data };
  }
  // GitHub returns JSON {message, documentation_url} for 4xx/5xx.
  let detail = "";
  try {
    const body = (await res.json()) as { message?: string };
    detail = body.message ? ` — ${body.message}` : "";
  } catch {
    // ignore body parse failure
  }
  return { ok: false, error: `GitHub ${res.status}${detail}` };
}

export type RepoMeta = {
  full_name: string;
  description: string | null;
  default_branch: string;
  private: boolean;
  html_url: string;
  pushed_at: string | null;
  language: string | null;
  stargazers_count: number;
  open_issues_count: number;
};

export async function fetchRepoMetadata(
  ref: RepoRef,
): Promise<GitHubResult<RepoMeta>> {
  const res = await ghFetch(`/repos/${ref.owner}/${ref.repo}`);
  return asJsonOrError<RepoMeta>(res);
}

export async function fetchRepoReadme(
  ref: RepoRef,
): Promise<GitHubResult<{ path: string; content: string }>> {
  const res = await ghFetch(`/repos/${ref.owner}/${ref.repo}/readme`);
  type ReadmePayload = { path: string; content: string; encoding: string };
  const parsed = await asJsonOrError<ReadmePayload>(res);
  if (!parsed.ok) return parsed;
  const { path, content, encoding } = parsed.data;
  if (encoding !== "base64") {
    return { ok: false, error: `Unexpected README encoding: ${encoding}` };
  }
  const decoded = Buffer.from(content, "base64").toString("utf8");
  const capped = decoded.length > RAW_BYTE_CAP
    ? decoded.slice(0, RAW_BYTE_CAP) + "\n\n[…truncated]"
    : decoded;
  return { ok: true, data: { path, content: capped } };
}

export type TreeEntry = { path: string; type: "blob" | "tree"; size?: number };

export async function fetchRepoTree(
  ref: RepoRef,
  branch: string,
): Promise<GitHubResult<{ truncated: boolean; entries: TreeEntry[] }>> {
  const res = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  type TreePayload = {
    truncated: boolean;
    tree: { path: string; type: string; size?: number }[];
  };
  const parsed = await asJsonOrError<TreePayload>(res);
  if (!parsed.ok) return parsed;
  const entries: TreeEntry[] = parsed.data.tree
    .filter((e) => e.type === "blob" || e.type === "tree")
    .map((e) => ({
      path: e.path,
      type: e.type as "blob" | "tree",
      size: e.size,
    }));
  return {
    ok: true,
    data: { truncated: parsed.data.truncated, entries },
  };
}

export async function fetchRepoFile(
  ref: RepoRef,
  path: string,
  branch?: string,
): Promise<GitHubResult<{ path: string; content: string; size: number }>> {
  const qs = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  const res = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}${qs}`,
  );
  type FilePayload = {
    path: string;
    type: string;
    size: number;
    encoding?: string;
    content?: string;
  };
  const parsed = await asJsonOrError<FilePayload>(res);
  if (!parsed.ok) return parsed;
  if (parsed.data.type !== "file") {
    return {
      ok: false,
      error: `Path is a ${parsed.data.type}, not a file: ${path}`,
    };
  }
  if (parsed.data.encoding !== "base64" || !parsed.data.content) {
    return { ok: false, error: `Unsupported file encoding for ${path}.` };
  }
  const decoded = Buffer.from(parsed.data.content, "base64").toString("utf8");
  const capped = decoded.length > RAW_BYTE_CAP
    ? decoded.slice(0, RAW_BYTE_CAP) + "\n\n[…truncated]"
    : decoded;
  return {
    ok: true,
    data: { path: parsed.data.path, content: capped, size: parsed.data.size },
  };
}

export type CommitEntry = {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
};

export async function fetchRecentCommits(
  ref: RepoRef,
  branch: string,
  limit: number,
): Promise<GitHubResult<CommitEntry[]>> {
  const capped = Math.max(1, Math.min(50, limit));
  const res = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${capped}`,
  );
  type CommitsPayload = {
    sha: string;
    commit: {
      message: string;
      author: { name?: string; date?: string } | null;
    };
  }[];
  const parsed = await asJsonOrError<CommitsPayload>(res);
  if (!parsed.ok) return parsed;
  const entries: CommitEntry[] = parsed.data.map((c) => ({
    sha: c.sha.slice(0, 7),
    message: (c.commit.message ?? "").split("\n")[0],
    author: c.commit.author?.name ?? null,
    date: c.commit.author?.date ?? null,
  }));
  return { ok: true, data: entries };
}
