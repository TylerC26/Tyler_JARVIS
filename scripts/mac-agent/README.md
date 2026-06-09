# jarvis-mac-agent

Local daemon that picks up coding tasks queued by Jarvis (via the
`dispatch_repo_task` chat tool) and runs them with `claude -p` inside a target
repo on a fresh `jarvis/*` branch. Reports the result back to Telegram.

## Architecture

```
phone ── Telegram ── Vercel webhook ── orchestrator ── dispatch_repo_task
                                                              │
                                                              ▼
                                              insert into public.repo_tasks
                                                              │
                                  ┌───────── Supabase Realtime ─────────┐
                                  │                                     │
                                  ▼                                     │
                              Mac daemon (this) ── claude -p ── git commit
                                  │
                                  └── Telegram report (success/failure)
```

The Mac is never reached from the public internet. All comms are outbound:
Supabase Realtime over wss, Telegram Bot API over https, Anthropic API over
https.

## Setup

### 1. Create the env file

`~/.jarvis/mac-agent.env`:

```
OWNER_ID=00000000-0000-0000-0000-000000000001
NEXT_PUBLIC_SUPABASE_URL=https://uisfucwkxbyrtykcowns.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard — Settings → API>
TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_ALLOWED_CHAT_ID=<your chat id>
ANTHROPIC_API_KEY=<key with billing for the spawned `claude` process>
```

`OWNER_ID` MUST match the value Vercel uses or Realtime filters won't fire.

The daemon uses the **service-role** key (not the anon key): `repo_tasks` is
under Row-Level Security and the daemon has no Supabase Auth session, so the
anon key reads zero rows and every claim/status write is silently dropped. The
service-role key bypasses RLS — keep it local to this Mac and never ship it to
the browser.

### 2. Create the config file

`~/.jarvis/mac-agent.toml`:

```toml
[daemon]
max_concurrent_tasks = 1
agent_timeout_seconds = 600
log_level = "info"

[safety]
max_diff_lines = 5000
dangerous_globs = [".env*", "*.pem", "*.key", "**/credentials*", "**/.git/**"]
require_clean_worktree = true

[[repos]]
path = "/Users/tylerc/Dev/Jarvis"
slug = "jarvis"
allowed_agents = ["claude-code"]
```

The daemon will refuse any task whose `repo_path` is not in this file. Add more
`[[repos]]` blocks to allow other repos.

### 3. Smoke-test in the foreground

```
cd /Users/tylerc/Dev/Jarvis
npm run agent:start
```

You should see "jarvis-mac-agent starting" and "realtime channel: SUBSCRIBED".
In another shell, manually queue a task via the Supabase SQL editor:

```sql
insert into public.repo_tasks (owner_id, repo_path, instruction)
values ('00000000-0000-0000-0000-000000000001',
        '/Users/tylerc/Dev/Jarvis',
        'add a comment at the top of README.md saying "hello from jarvis"');
```

Within seconds the daemon should claim it, run `claude -p`, commit on a
`jarvis/*` branch, and post a Telegram message.

### 4. Install as a launchd service

```
npm run agent:install
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jarvis.mac-agent.plist
launchctl enable     gui/$(id -u)/com.jarvis.mac-agent
```

Logs land in `~/Library/Logs/jarvis-mac-agent.{out,err}.log`.

To stop and remove:

```
launchctl bootout gui/$(id -u)/com.jarvis.mac-agent
rm ~/Library/LaunchAgents/com.jarvis.mac-agent.plist
```

## Wake-state

Realtime requires the Mac to be awake. In `System Settings → Battery → Options`
enable "Wake for network access". To prevent idle sleep entirely, wrap the
daemon in `caffeinate -i` by editing the plist's `ProgramArguments` to
`["/usr/bin/caffeinate", "-i", "<tsx>", "scripts/mac-agent/index.ts"]`.

Closing the laptop lid still puts the Mac to sleep regardless. For
clamshell-with-external-display setups this is fine; for laptop-only setups,
queued tasks will sit until the lid is opened.

## Safety layers

In order:

1. Vercel `dispatch_repo_task` tool rejects unknown project slugs.
2. Daemon allowlist (this `[[repos]]` block) rejects unknown `repo_path`s.
3. Pre-flight `git status --porcelain` refuses to run on a dirty work tree.
4. Pre-commit guard aborts if any staged file matches `dangerous_globs`, or if
   the staged diff exceeds `max_diff_lines`.
5. Daemon never pushes — branch stays local for human review.
6. Daemon runs as the user (never sudo); spawned `claude` inherits that scope.

## Troubleshooting

- **"realtime channel: CLOSED"** — Supabase URL or anon key is wrong, or the
  network dropped. The 30s periodic scan will still pick up new tasks.
- **Task stuck in `running`** — daemon died mid-task. Restart the daemon; on
  startup it rescues `running` rows older than `agent_timeout_seconds` to
  `failed`.
- **"Working tree at … has uncommitted changes"** — by design. Commit or stash
  on the Mac, then re-queue the task.
- **Pre-commit guard tripped on `.env*`** — the agent tried to touch a secret
  file. Inspect the leftover branch (`git branch | grep jarvis/`) and decide
  whether to reword the instruction.
