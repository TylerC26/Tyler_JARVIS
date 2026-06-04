// Native meeting capture (Milestone C/D).
//
// Captures the mic (cpal) AND system output audio (ruhear → ScreenCaptureKit),
// downmixes + resamples both to 24 kHz mono PCM16, mixes them, and streams the
// result to OpenAI's realtime transcription WebSocket. Transcript deltas/finals
// come back over the socket and are forwarded to the webview as Tauri events.
//
// The webview (the deployed Vercel site, loaded remotely) fetches a short-lived
// ephemeral token from /api/meetings/realtime-token, then calls
// `start_meeting_capture` with it. The OpenAI master key never touches the
// client — Rust connects with `Authorization: Bearer <ek_...>`.
//
// Threading model: cpal and ruhear streams are NOT Send, so each runs on its own
// std::thread that owns its stream and parks until the shared stop flag flips.
// The WebSocket runs on a dedicated tokio runtime in another thread. All three
// share lock-free-ish i16 queues (Mutex<VecDeque>) for the 24 kHz mono samples.
//
// Events emitted to the webview:
//   meeting-status     { status: "connected" }
//   meeting-transcript { kind: "delta" | "completed", text: String }
//   meeting-error      { message: String }

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::{header::AUTHORIZATION, HeaderValue};
use tokio_tungstenite::tungstenite::Message;

const TARGET_RATE: u32 = 24_000;
const FRAME_SAMPLES: usize = 480; // 20 ms @ 24 kHz
const QUEUE_CAP: usize = TARGET_RATE as usize * 2; // ~2 s safety cap against drift

type Queue = Arc<Mutex<VecDeque<i16>>>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOpts {
    pub token: String,
    pub ws_url: String,
    #[serde(default = "default_true")]
    pub capture_mic: bool,
    #[serde(default = "default_true")]
    pub capture_system: bool,
}
fn default_true() -> bool {
    true
}

#[derive(Clone, Serialize)]
struct TranscriptPayload {
    kind: String,
    text: String,
}
#[derive(Clone, Serialize)]
struct StatusPayload {
    status: String,
}
#[derive(Clone, Serialize)]
struct ErrorPayload {
    message: String,
}

pub struct Session {
    stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct MeetingState {
    inner: Mutex<Option<Session>>,
}

// ---------- audio helpers ----------

#[inline]
fn to_i16(s: f32) -> i16 {
    (s.clamp(-1.0, 1.0) * 32767.0) as i16
}

// Average interleaved channels down to mono f32.
fn downmix_interleaved(data: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return data.to_vec();
    }
    let ch = channels as usize;
    data.chunks(ch)
        .map(|f| f.iter().copied().sum::<f32>() / ch as f32)
        .collect()
}

// Linear-resample mono f32 from `in_rate` to 24 kHz and convert to i16.
fn resample_to_i16(mono: &[f32], in_rate: u32) -> Vec<i16> {
    if mono.is_empty() {
        return Vec::new();
    }
    if in_rate == TARGET_RATE {
        return mono.iter().map(|s| to_i16(*s)).collect();
    }
    let ratio = TARGET_RATE as f64 / in_rate as f64;
    let out_len = ((mono.len() as f64) * ratio).floor() as usize;
    let mut out = Vec::with_capacity(out_len);
    let last = mono.len() - 1;
    for i in 0..out_len {
        let src = i as f64 / ratio;
        let idx = src.floor() as usize;
        let frac = (src - idx as f64) as f32;
        let a = mono[idx.min(last)];
        let b = mono[(idx + 1).min(last)];
        out.push(to_i16(a + (b - a) * frac));
    }
    out
}

// Per-channel f32 buffers (ruhear) -> mono -> 24 kHz i16.
fn downmix_resample_planar(channels: &[Vec<f32>], in_rate: u32) -> Vec<i16> {
    let n_ch = channels.len().max(1);
    let frames = channels.first().map(|c| c.len()).unwrap_or(0);
    if frames == 0 {
        return Vec::new();
    }
    let mut mono = vec![0f32; frames];
    for ch in channels {
        for (i, s) in ch.iter().enumerate() {
            if i < frames {
                mono[i] += *s;
            }
        }
    }
    let inv = 1.0 / n_ch as f32;
    for s in mono.iter_mut() {
        *s *= inv;
    }
    resample_to_i16(&mono, in_rate)
}

fn push_capped(q: &Queue, samples: &[i16]) {
    if samples.is_empty() {
        return;
    }
    let mut g = q.lock().unwrap();
    g.extend(samples.iter().copied());
    while g.len() > QUEUE_CAP {
        g.pop_front();
    }
}

fn pop_n(q: &Queue, n: usize) -> Vec<i16> {
    let mut g = q.lock().unwrap();
    let take = n.min(g.len());
    g.drain(0..take).collect()
}

// Take up to `n` samples from each source and additively mix (clamped). A silent
// source contributes nothing; if one source is ahead, the queue cap bounds latency.
fn mix_frame(sys: &Queue, mic: &Queue, n: usize) -> Vec<i16> {
    let mut a = pop_n(sys, n);
    let mut b = pop_n(mic, n);
    if a.is_empty() && b.is_empty() {
        return Vec::new();
    }
    let len = a.len().max(b.len());
    a.resize(len, 0);
    b.resize(len, 0);
    (0..len)
        .map(|i| (a[i] as i32 + b[i] as i32).clamp(-32768, 32767) as i16)
        .collect()
}

fn pcm16_to_base64(frame: &[i16]) -> String {
    let mut bytes = Vec::with_capacity(frame.len() * 2);
    for s in frame {
        bytes.extend_from_slice(&s.to_le_bytes());
    }
    STANDARD.encode(&bytes)
}

// ---------- capture threads ----------

fn run_mic(q: Queue, stop: Arc<AtomicBool>) -> Result<(), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "no default input (microphone) device".to_string())?;
    let supported = device
        .default_input_config()
        .map_err(|e| e.to_string())?;
    let in_rate = supported.sample_rate(); // cpal 0.17: returns u32 directly
    let channels = supported.channels();
    let config: cpal::StreamConfig = supported.clone().into();
    let err_fn = |e| eprintln!("[meeting] mic stream error: {e}");

    let stream = match supported.sample_format() {
        cpal::SampleFormat::F32 => {
            let q = q.clone();
            device.build_input_stream(
                &config,
                move |data: &[f32], _: &_| {
                    let mono = downmix_interleaved(data, channels);
                    push_capped(&q, &resample_to_i16(&mono, in_rate));
                },
                err_fn,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let q = q.clone();
            device.build_input_stream(
                &config,
                move |data: &[i16], _: &_| {
                    let f: Vec<f32> = data.iter().map(|s| *s as f32 / 32768.0).collect();
                    let mono = downmix_interleaved(&f, channels);
                    push_capped(&q, &resample_to_i16(&mono, in_rate));
                },
                err_fn,
                None,
            )
        }
        other => return Err(format!("unsupported mic sample format: {other:?}")),
    }
    .map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;
    while !stop.load(Ordering::Relaxed) {
        std::thread::sleep(Duration::from_millis(100));
    }
    drop(stream);
    Ok(())
}

fn run_system(q: Queue, stop: Arc<AtomicBool>) -> Result<(), String> {
    use ruhear::{rucallback, RUBuffers, RUHear};
    let q2 = q.clone();
    // ruhear delivers 48 kHz multichannel f32 on macOS (RUBuffers = Vec<Vec<f32>>,
    // one Vec per channel). rucallback! wraps the closure in Arc<Mutex<…>>;
    // RUHear::new takes that.
    let cb = rucallback!(move |data: RUBuffers| {
        push_capped(&q2, &downmix_resample_planar(&data, 48_000));
    });
    let mut rh = RUHear::new(cb);
    let _ = rh.start();
    while !stop.load(Ordering::Relaxed) {
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = rh.stop();
    Ok(())
}

// ---------- websocket pipeline ----------

fn emit_error(app: &AppHandle, message: impl Into<String>) {
    let _ = app.emit(
        "meeting-error",
        ErrorPayload {
            message: message.into(),
        },
    );
}

fn spawn_ws(app: AppHandle, opts_token: String, ws_url: String, sys_q: Queue, mic_q: Queue, stop: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let rt = match tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
        {
            Ok(r) => r,
            Err(e) => {
                emit_error(&app, format!("tokio runtime: {e}"));
                return;
            }
        };

        rt.block_on(async move {
            let mut request = match ws_url.into_client_request() {
                Ok(r) => r,
                Err(e) => {
                    emit_error(&app, format!("bad ws url: {e}"));
                    return;
                }
            };
            match HeaderValue::from_str(&format!("Bearer {opts_token}")) {
                Ok(v) => {
                    request.headers_mut().insert(AUTHORIZATION, v);
                }
                Err(e) => {
                    emit_error(&app, format!("bad token header: {e}"));
                    return;
                }
            }

            let (ws, _resp) = match tokio_tungstenite::connect_async(request).await {
                Ok(x) => x,
                Err(e) => {
                    emit_error(&app, format!("ws connect failed: {e}"));
                    return;
                }
            };
            let (mut write, mut read) = ws.split();
            let _ = app.emit(
                "meeting-status",
                StatusPayload {
                    status: "connected".into(),
                },
            );

            // Reader: forward transcript events to the webview.
            let app_reader = app.clone();
            let reader = tokio::spawn(async move {
                while let Some(msg) = read.next().await {
                    let txt = match msg {
                        Ok(Message::Text(t)) => t,
                        Ok(Message::Close(_)) | Err(_) => break,
                        _ => continue,
                    };
                    let v: serde_json::Value = match serde_json::from_str(txt.as_str()) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    match v.get("type").and_then(|t| t.as_str()).unwrap_or("") {
                        "conversation.item.input_audio_transcription.delta" => {
                            let text = v.get("delta").and_then(|d| d.as_str()).unwrap_or("");
                            let _ = app_reader.emit(
                                "meeting-transcript",
                                TranscriptPayload {
                                    kind: "delta".into(),
                                    text: text.into(),
                                },
                            );
                        }
                        "conversation.item.input_audio_transcription.completed" => {
                            let text =
                                v.get("transcript").and_then(|d| d.as_str()).unwrap_or("");
                            let _ = app_reader.emit(
                                "meeting-transcript",
                                TranscriptPayload {
                                    kind: "completed".into(),
                                    text: text.into(),
                                },
                            );
                        }
                        "error" => {
                            let m = v
                                .get("error")
                                .and_then(|e| e.get("message"))
                                .and_then(|m| m.as_str())
                                .unwrap_or("transcription error");
                            emit_error(&app_reader, m);
                        }
                        _ => {}
                    }
                }
            });

            // Sender: every 20 ms, mix a frame and append it to the input buffer.
            let mut ticker = tokio::time::interval(Duration::from_millis(20));
            loop {
                if stop.load(Ordering::Relaxed) {
                    break;
                }
                ticker.tick().await;
                let frame = mix_frame(&sys_q, &mic_q, FRAME_SAMPLES);
                if frame.is_empty() {
                    continue;
                }
                let payload = format!(
                    "{{\"type\":\"input_audio_buffer.append\",\"audio\":\"{}\"}}",
                    pcm16_to_base64(&frame)
                );
                if write.send(Message::Text(payload.into())).await.is_err() {
                    break;
                }
            }

            let _ = write.send(Message::Close(None)).await;
            reader.abort();
        });
    });
}

// ---------- Tauri commands ----------

fn stop_session(state: &tauri::State<'_, MeetingState>) {
    if let Some(session) = state.inner.lock().unwrap().take() {
        session.stop.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn start_meeting_capture(
    app: AppHandle,
    state: tauri::State<'_, MeetingState>,
    opts: StartOpts,
) -> Result<(), String> {
    if !opts.capture_mic && !opts.capture_system {
        return Err("enable at least one of mic / system audio".into());
    }
    // Replace any previous session.
    stop_session(&state);

    let stop = Arc::new(AtomicBool::new(false));
    let sys_q: Queue = Arc::new(Mutex::new(VecDeque::new()));
    let mic_q: Queue = Arc::new(Mutex::new(VecDeque::new()));

    spawn_ws(
        app.clone(),
        opts.token.clone(),
        opts.ws_url.clone(),
        sys_q.clone(),
        mic_q.clone(),
        stop.clone(),
    );

    if opts.capture_mic {
        let q = mic_q.clone();
        let stop = stop.clone();
        let app = app.clone();
        std::thread::spawn(move || {
            if let Err(e) = run_mic(q, stop) {
                emit_error(&app, format!("mic: {e}"));
            }
        });
    }
    if opts.capture_system {
        let q = sys_q.clone();
        let stop = stop.clone();
        let app = app.clone();
        std::thread::spawn(move || {
            if let Err(e) = run_system(q, stop) {
                emit_error(&app, format!("system audio: {e}"));
            }
        });
    }

    *state.inner.lock().unwrap() = Some(Session { stop });
    Ok(())
}

#[tauri::command]
pub fn stop_meeting_capture(state: tauri::State<'_, MeetingState>) -> Result<(), String> {
    stop_session(&state);
    Ok(())
}
