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

## Meeting capture (native audio — Milestone C/D)

The shell now adds native audio capture so the **Meetings** feature can transcribe live
in the desktop app — including **system audio** (Zoom/Teams remote participants), which a
browser can't reach. Implemented in [`src-tauri/src/meeting.rs`](src-tauri/src/meeting.rs):

- `cpal` captures the **mic**; `ruhear` (→ ScreenCaptureKit) captures **system output**.
- Both are downmixed + resampled to 24 kHz mono PCM16, mixed, and streamed over a
  WebSocket to OpenAI's realtime transcription (`gpt-realtime-whisper`).
- Transcript deltas/finals come back and are emitted to the web UI as Tauri events
  (`meeting-transcript`, `meeting-error`, `meeting-status`). The page drives it via
  `window.__TAURI__` (`app.withGlobalTauri` is enabled), using the `start_meeting_capture`
  / `stop_meeting_capture` commands.
- The OpenAI key never reaches the client: the web UI fetches a short-lived ephemeral
  token from `/api/meetings/realtime-token` and passes it to Rust, which connects with
  `Authorization: Bearer <ek_…>`.

### macOS permissions (first run)

- **Microphone** — prompted automatically (`NSMicrophoneUsageDescription` is in
  [`src-tauri/Info.plist`](src-tauri/Info.plist)).
- **Screen Recording** — ScreenCaptureKit's system-audio capture is gated by this. macOS
  prompts on first use; if not, grant it under **System Settings → Privacy & Security →
  Screen Recording** and relaunch. (There's no Info.plist key for it.)

### Dev tip

`tauri dev` loads production by default. To iterate on the web UI + Rust together, point
`build.devUrl` in `tauri.conf.json` at `http://localhost:3000` and run `npm run dev` too.

### Known-uncertain spots (verify on first `cargo build`)

This native code was written without a local build available, so expect 1–2 small fixes:

1. **`ruhear` `RUBuffers` shape** — assumed `Vec<Vec<f32>>` (per channel) in
   `downmix_resample_planar`. If the crate exposes a struct/newtype, adjust that call.
2. **`tokio-tungstenite` 0.26** — `Message::Text(_)` takes `Utf8Bytes`; if you bump the
   version and the type/feature names change, adjust the WS send/read + the
   `rustls-tls-webpki-roots` feature.
3. **Tauri remote-IPC** — [`capabilities/remote.json`](src-tauri/capabilities/remote.json)
   grants the Vercel origin event access. If `invoke('start_meeting_capture')` from the
   remote page is blocked, the custom commands may also need to be listed there.

### Verify end-to-end

1. `npm run desktop:dev` (the deployed site must already have the Meetings UI — push the
   web changes / let Vercel deploy first).
2. Open **Meetings → ● record**. Grant mic + screen-recording when prompted.
3. Play a YouTube clip or join a test call and talk; confirm live captions appear.
4. **■ stop & summarize** → you land on the meeting detail with a summary, and a note +
   tasks + memory are created (these run on Vercel where `ANTHROPIC_API_KEY` is set).

## What this shell deliberately does *not* do

- It does **not** bundle a local server. Your data (Supabase) and AI (Anthropic/DeepSeek)
  are remote, so there's nothing to gain from running Next.js locally inside the app.
