# Jarvis — macOS desktop shell

A [Tauri v2](https://v2.tauri.app) native wrapper around the deployed Jarvis web app.
It is a real `.app` (Dock icon, native window + menu bar) whose webview loads
`https://tyler-jarvis.vercel.app`. There are **no bundled frontend assets** — the
window points straight at production, so the Next.js app, Supabase, AI routes, and
Telegram/Discord webhooks all keep running on Vercel exactly as before.

On top of the web wrapper, the shell ships **native meeting recording**
(`src-tauri/src/meeting.rs`): mic (cpal) + system audio (ScreenCaptureKit via
ruhear), mixed to 16 kHz mono WAV chunks on disk, uploaded to Supabase Storage
and batch-transcribed after the meeting (record-then-transcribe — nothing
streams in realtime). The webview's /meetings page drives it over Tauri IPC.

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
| `npm run desktop:build` | Produce a release `.app` at `desktop/src-tauri/target/release/bundle/macos/Jarvis.app` **and** a shareable installer at `desktop/src-tauri/target/release/bundle/dmg/Jarvis_<version>_aarch64.dmg`. |
| `npm run desktop:icon <path/to/1024.png>` | Regenerate the icon set from a square source image (≥1024×1024). |

To install: drag `Jarvis.app` into `/Applications`.

## Installing on another Mac (e.g. the work machine)

1. `npm run desktop:build`, then copy
   `desktop/src-tauri/target/release/bundle/dmg/Jarvis_<version>_aarch64.dmg`
   over (AirDrop/USB/Drive). Open it and drag **Jarvis** into **Applications**.
   The build is Apple Silicon-only — for an Intel Mac, build universal:
   `rustup target add x86_64-apple-darwin`, then
   `cd desktop && tauri build --target universal-apple-darwin`.
2. The app is ad-hoc signed (no Apple Developer cert), so Gatekeeper will balk
   on first launch: **right-click → Open → Open**. On newer macOS that path may
   not offer "Open" — instead launch once, then System Settings → Privacy &
   Security → **Open Anyway**, or just run
   `xattr -dr com.apple.quarantine /Applications/Jarvis.app`.
3. First recording prompts for **Microphone** access — allow it.
4. The first time system audio is captured, macOS prompts for **Screen
   Recording** (that permission gates ScreenCaptureKit audio loopback):
   System Settings → Privacy & Security → Screen Recording → enable Jarvis,
   then **quit and relaunch the app**. Until then recordings are mic-only
   (the recorder UI shows a "mic only" badge).
5. Re-installing a rebuilt app changes the ad-hoc signature, so macOS may
   re-prompt for both permissions after an update.

## Meeting recording — moving parts

- Audio lands in `~/Library/Application Support/com.tylerc.jarvis/recordings/{meeting-id}/chunk-NNN.wav`,
  rotated every 5 minutes. Local files are the source of truth and are deleted
  only after the server pipeline (upload → Whisper transcription → Claude
  summary) finishes; an interrupted run can be resumed from the meeting's
  detail page (⟳ resume processing).
- `screencapturekit` is pinned to `=1.4.2` in `Cargo.toml` — ruhear 0.1.1
  breaks against 1.5.x. Don't bump it without testing system-audio capture.
- `build.rs` adds an rpath to `/usr/lib/swift`; without it the app crashes at
  launch with a missing `libswift_Concurrency.dylib`.
- The webview is the *remote* production site, so IPC from it is only allowed
  because `capabilities/remote.json` whitelists the Vercel origin, and the page
  uses `window.__TAURI__` (enabled by `withGlobalTauri`) rather than importing
  `@tauri-apps/api`.

## Changing the URL

Edit `build.frontendDist` (and `build.devUrl`) in
[`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json). To point at a local dev
server instead, set them to `http://localhost:3000` and run `npm run dev` alongside —
and add the localhost origin to `capabilities/remote.json` so the recorder IPC works.

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
- It does **not** stream audio anywhere in realtime. v1's live transcription
  (OpenAI realtime WebSocket) was removed for unreliability; the recorder is
  strictly file-based.
