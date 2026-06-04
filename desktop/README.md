# Jarvis — macOS desktop shell

A thin [Tauri v2](https://v2.tauri.app) native wrapper around the deployed Jarvis web app.
It is a real `.app` (Dock icon, native window + menu bar) whose webview loads
`https://tyler-jarvis.vercel.app`. There are **no bundled frontend assets** — the
window points straight at production, so the Next.js app, Supabase, AI routes, and
Telegram/Discord webhooks all keep running on Vercel exactly as before.

## Prerequisites

- **Rust** (installed via [rustup](https://rustup.rs)) and **Xcode Command Line Tools**.
- `cargo` must be on your `PATH`. rustup was installed here *without* modifying your
  shell profile, so add this line to `~/.zprofile` (or `~/.zshrc`) once:

  ```sh
  . "$HOME/.cargo/env"
  ```

  Until you do, prefix commands with `PATH="$HOME/.cargo/bin:$PATH"`.

## Commands (run from the repo root)

| Command | What it does |
| --- | --- |
| `npm run desktop:dev` | Launch the app in dev mode (hot-reloads the Rust shell; webview shows production). |
| `npm run desktop:build` | Produce a release `.app` at `desktop/src-tauri/target/release/bundle/macos/Jarvis.app`. |
| `npm run desktop:icon <path/to/1024.png>` | Regenerate the icon set from a square source image (≥1024×1024). |

To install: drag `Jarvis.app` into `/Applications`.

## Changing the URL

Edit `build.frontendDist` (and `build.devUrl`) in
[`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json). To point at a local dev
server instead, set them to `http://localhost:3000` and run `npm run dev` alongside.

## Swapping the icon

The current icons were generated from the 256px `app/favicon.ico` (upscaled), so the
largest Finder preview is slightly soft. For crisp icons, drop a ≥1024×1024 PNG and run:

```sh
npm run desktop:icon /absolute/path/to/jarvis-1024.png
```

The generated source is kept at `desktop/app-icon.png`.

## Producing a `.dmg`

Change `bundle.targets` in `tauri.conf.json` from `"app"` to `"dmg"` (or `["app", "dmg"]`),
then `npm run desktop:build`.

## What this shell deliberately does *not* do

- It does **not** bundle a local server. Your data (Supabase) and AI (Anthropic/DeepSeek)
  are remote, so there's nothing to gain from running Next.js locally inside the app.
- It does **not** add native Tauri commands/IPC. It's a pure web wrapper. Native features
  (global hotkeys, tray icon, native notifications) can be added later via Tauri plugins.
