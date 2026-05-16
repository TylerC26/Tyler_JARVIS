// Safe git operations the daemon uses around an agent run. All shell-outs go
// through execa with cwd pinned to the repo path — no shell interpolation, no
// risk of injection from the instruction text.

import { execa } from "execa";

// Tiny glob → RegExp converter. Supports `*` (any non-slash), `**` (any),
// `?` (single non-slash). Good enough for security globs like `.env*` and
// `**/credentials*`. Also matches against the basename so a glob like `.env*`
// matches `apps/web/.env.local`.
function globToRegex(glob: string): RegExp {
  let pattern = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        pattern += ".*";
        i += 2;
      } else {
        pattern += "[^/]*";
        i += 1;
      }
    } else if (c === "?") {
      pattern += "[^/]";
      i += 1;
    } else if (".+^$|()[]{}\\".includes(c)) {
      pattern += "\\" + c;
      i += 1;
    } else {
      pattern += c;
      i += 1;
    }
  }
  return new RegExp(`^${pattern}$`);
}

export type GitDiffStat = {
  filesChanged: number;
  raw: string;
};

export async function currentBranch(cwd: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  return stdout.trim();
}

export async function isInsideWorkTree(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execa("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

export async function workTreeIsClean(cwd: string): Promise<boolean> {
  const { stdout } = await execa("git", ["status", "--porcelain"], { cwd });
  return stdout.trim() === "";
}

export async function checkoutNewBranch(cwd: string, branch: string): Promise<void> {
  await execa("git", ["checkout", "-b", branch], { cwd });
}

export async function stageAll(cwd: string): Promise<void> {
  await execa("git", ["add", "-A"], { cwd });
}

export async function stagedFiles(cwd: string): Promise<{ status: string; path: string }[]> {
  const { stdout } = await execa("git", ["diff", "--cached", "--name-status"], { cwd });
  const lines = stdout.split("\n").filter(Boolean);
  return lines.map((line) => {
    const [status, ...rest] = line.split("\t");
    return { status: status.trim(), path: rest.join("\t").trim() };
  });
}

export async function stagedDiffLineCount(cwd: string): Promise<number> {
  // Use --numstat to sum added + deleted across all staged files.
  const { stdout } = await execa("git", ["diff", "--cached", "--numstat"], { cwd });
  let total = 0;
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const [a, d] = line.split("\t");
    const ai = Number.parseInt(a, 10);
    const di = Number.parseInt(d, 10);
    if (!Number.isNaN(ai)) total += ai;
    if (!Number.isNaN(di)) total += di;
  }
  return total;
}

export function isDangerousPath(path: string, dangerousGlobs: string[]): boolean {
  const basename = path.split("/").pop() ?? path;
  for (const glob of dangerousGlobs) {
    const re = globToRegex(glob);
    if (re.test(path) || re.test(basename)) return true;
  }
  return false;
}

export async function commit(cwd: string, message: string): Promise<string> {
  await execa("git", ["commit", "-m", message], { cwd });
  const { stdout } = await execa("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
}

export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  try {
    await execa("git", ["rev-parse", "--verify", `refs/heads/${branch}`], { cwd });
    return true;
  } catch {
    return false;
  }
}

export async function stashAll(cwd: string, message: string): Promise<boolean> {
  // -u captures untracked files. Returns true if anything was stashed.
  const { stdout } = await execa(
    "git",
    ["stash", "push", "-u", "-m", message],
    { cwd, reject: false },
  );
  return !stdout.includes("No local changes to save");
}

export async function hardReset(cwd: string): Promise<void> {
  await execa("git", ["reset", "--hard", "HEAD"], { cwd });
}

export async function cleanUntracked(cwd: string): Promise<void> {
  // -f force, -d include dirs. Does NOT touch .gitignored files (no -x).
  await execa("git", ["clean", "-fd"], { cwd });
}

export async function checkout(cwd: string, branch: string): Promise<void> {
  await execa("git", ["checkout", branch], { cwd });
}

export async function deleteBranch(cwd: string, branch: string): Promise<void> {
  // -D = force delete (the branch may be ahead of base; for failed tasks it's
  // usually equal to base since no commit happened, but be defensive).
  await execa("git", ["branch", "-D", branch], { cwd });
}

export async function diffStat(cwd: string, baseBranch: string): Promise<GitDiffStat> {
  const { stdout } = await execa("git", ["diff", "--stat", `${baseBranch}...HEAD`], { cwd });
  // Last non-empty line typically: " 3 files changed, 12 insertions(+), 1 deletion(-)"
  const lines = stdout.split("\n").filter(Boolean);
  const summary = lines[lines.length - 1] ?? "";
  const m = summary.match(/(\d+)\s+files?\s+changed/);
  return {
    filesChanged: m ? Number.parseInt(m[1], 10) : 0,
    raw: stdout,
  };
}
