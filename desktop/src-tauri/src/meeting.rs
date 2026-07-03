// Native meeting recording (Meetings v2 — record-then-transcribe).
//
// Captures the mic (cpal) AND system output audio (ruhear → ScreenCaptureKit),
// downmixes + resamples both to 16 kHz mono PCM16, mixes them, and appends the
// result to local WAV files, rotating to a new chunk every ~10 seconds
// (~320 KB — far under Whisper's 25 MB limit) so transcripts land ~10-15 s
// behind the mic and read as near-real-time. This is deliberately NOT the WS
// streaming that made v1 unreliable (OpenAI realtime, removed in 14ece7d):
// each short chunk is still an independently decodable WAV run through the same
// batch upload → Whisper → finalize pipeline as the 5-minute chunks were. The
// local files are the durable source of truth until the webview finishes that
// pipeline.
//
// The webview (the deployed Vercel site, loaded remotely) drives everything:
// on each `meeting-chunk-ready` event it mints a signed Supabase Storage upload
// URL from /api/meetings/upload-url and calls `upload_meeting_chunk`, which
// PUTs the file from Rust (no multi-MB payloads across the IPC bridge, no
// Supabase credentials in the binary).
//
// Threading model (unchanged from v1): cpal and ruhear streams are NOT Send, so
// each runs on its own std::thread that owns its stream and parks until the
// shared stop flag flips. The WAV writer runs on a third thread, draining the
// shared i16 queues (Mutex<VecDeque>) every 100 ms.
//
// Events emitted to the webview:
//   meeting-chunk-ready        { meetingId, index, path, durationMs, sizeBytes }
//   meeting-recording-stopped  { meetingId, totalDurationMs, chunkCount }
//   meeting-source-status      { source: "system", ok, message }
//   meeting-level              { level }   (peak amplitude 0..1, ~100 ms cadence)
//   meeting-error              { message }

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

const TARGET_RATE: u32 = 16_000;
// Rotate WAV files every ~10 s for near-real-time transcripts. Whisper still
// gets enough context per chunk to punctuate; server-side silence gating drops
// the empty ones so we don't pay for (or hallucinate on) quiet stretches.
const CHUNK_SECONDS: u64 = 10;
const QUEUE_CAP: usize = TARGET_RATE as usize * 2; // ~2 s safety cap against drift

type Queue = Arc<Mutex<VecDeque<i16>>>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOpts {
    pub meeting_id: String,
    #[serde(default = "default_true")]
    pub capture_mic: bool,
    #[serde(default = "default_true")]
    pub capture_system: bool,
    // First chunk index for this session — non-zero when continuing an
    // existing meeting, so new chunks append after the ones already recorded.
    #[serde(default)]
    pub start_index: u32,
}
fn default_true() -> bool {
    true
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChunkReadyPayload {
    meeting_id: String,
    index: u32,
    path: String,
    duration_ms: u64,
    size_bytes: u64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoppedPayload {
    meeting_id: String,
    total_duration_ms: u64,
    chunk_count: u32,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceStatusPayload {
    source: String,
    ok: bool,
    message: String,
}
#[derive(Clone, Serialize)]
struct ErrorPayload {
    message: String,
}
#[derive(Clone, Serialize)]
struct LevelPayload {
    level: f32,
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

// Linear-resample mono f32 from `in_rate` to 16 kHz and convert to i16.
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

// Per-channel f32 buffers (ruhear) -> mono -> 16 kHz i16.
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

// Track the loudest sample seen since the last meter emit. Updated directly by
// the capture callbacks so the level reflects raw mic/system audio.
type Level = Arc<Mutex<f32>>;

fn update_peak(level: &Level, samples: &[i16]) {
    let mut peak = 0.0_f32;
    for s in samples {
        let a = (*s as i32).unsigned_abs() as f32 / 32768.0;
        if a > peak {
            peak = a;
        }
    }
    if peak > 0.0 {
        let mut g = level.lock().unwrap();
        if peak > *g {
            *g = peak;
        }
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

// ---------- capture threads ----------

fn run_mic(q: Queue, level: Level, stop: Arc<AtomicBool>) -> Result<(), String> {
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
            let level = level.clone();
            device.build_input_stream(
                &config,
                move |data: &[f32], _: &_| {
                    let mono = downmix_interleaved(data, channels);
                    let pcm = resample_to_i16(&mono, in_rate);
                    update_peak(&level, &pcm);
                    push_capped(&q, &pcm);
                },
                err_fn,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let q = q.clone();
            let level = level.clone();
            device.build_input_stream(
                &config,
                move |data: &[i16], _: &_| {
                    let f: Vec<f32> = data.iter().map(|s| *s as f32 / 32768.0).collect();
                    let mono = downmix_interleaved(&f, channels);
                    let pcm = resample_to_i16(&mono, in_rate);
                    update_peak(&level, &pcm);
                    push_capped(&q, &pcm);
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

// System-output capture. ScreenCaptureKit failures (permission denied, broken
// SCStream) often surface as *no callbacks* rather than an Err, so instead of
// trusting rh.start() we watch the delivered-sample counter: if nothing arrives
// within ~3 s the UI is told the meeting degraded to mic-only.
fn run_system(app: AppHandle, q: Queue, level: Level, stop: Arc<AtomicBool>) -> Result<(), String> {
    use ruhear::{rucallback, RUBuffers, RUHear};
    let q2 = q.clone();
    let level2 = level.clone();
    let delivered = Arc::new(AtomicU64::new(0));
    let delivered2 = delivered.clone();
    // ruhear delivers 48 kHz multichannel f32 on macOS (RUBuffers = Vec<Vec<f32>>,
    // one Vec per channel). rucallback! wraps the closure in Arc<Mutex<…>>;
    // RUHear::new takes that.
    let cb = rucallback!(move |data: RUBuffers| {
        let pcm = downmix_resample_planar(&data, 48_000);
        delivered2.fetch_add(pcm.len() as u64, Ordering::Relaxed);
        update_peak(&level2, &pcm);
        push_capped(&q2, &pcm);
    });
    let mut rh = RUHear::new(cb);
    let _ = rh.start();

    let mut ticks: u32 = 0;
    let mut reported: Option<bool> = None;
    while !stop.load(Ordering::Relaxed) {
        std::thread::sleep(Duration::from_millis(100));
        ticks += 1;
        let ok = delivered.load(Ordering::Relaxed) > 0;
        // Report once it works, or once it's been silent for 3 s (and recover if
        // samples show up later, e.g. after the user grants Screen Recording).
        let verdict = if ok {
            Some(true)
        } else if ticks >= 30 {
            Some(false)
        } else {
            None
        };
        if let Some(v) = verdict {
            if reported != Some(v) {
                reported = Some(v);
                let _ = app.emit(
                    "meeting-source-status",
                    SourceStatusPayload {
                        source: "system".into(),
                        ok: v,
                        message: if v {
                            String::new()
                        } else {
                            "no system audio captured — check Screen Recording permission \
                             (System Settings → Privacy & Security); recording continues mic-only"
                                .into()
                        },
                    },
                );
            }
        }
    }
    let _ = rh.stop();
    Ok(())
}

// ---------- WAV chunk writer ----------

fn emit_error(app: &AppHandle, message: impl Into<String>) {
    let _ = app.emit(
        "meeting-error",
        ErrorPayload {
            message: message.into(),
        },
    );
}

fn chunk_path(dir: &Path, index: u32) -> PathBuf {
    dir.join(format!("chunk-{index:03}.wav"))
}

fn wav_spec() -> hound::WavSpec {
    hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    }
}

// Finalize the current chunk file and announce it to the webview. Empty chunks
// (instant stop) are deleted instead of announced.
fn finish_chunk(
    app: &AppHandle,
    meeting_id: &str,
    writer: hound::WavWriter<std::io::BufWriter<std::fs::File>>,
    path: &Path,
    index: u32,
    samples: u64,
) -> bool {
    if let Err(e) = writer.finalize() {
        emit_error(app, format!("finalize chunk {index}: {e}"));
        return false;
    }
    if samples == 0 {
        let _ = std::fs::remove_file(path);
        return false;
    }
    let size_bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let _ = app.emit(
        "meeting-chunk-ready",
        ChunkReadyPayload {
            meeting_id: meeting_id.to_string(),
            index,
            path: path.to_string_lossy().into_owned(),
            duration_ms: samples * 1000 / TARGET_RATE as u64,
            size_bytes,
        },
    );
    true
}

// Drains the mixed queues every 100 ms into the current WAV chunk, rotating at
// CHUNK_SECONDS. Runs until the stop flag flips, then flushes what's left and
// emits meeting-recording-stopped.
fn spawn_writer(
    app: AppHandle,
    meeting_id: String,
    dir: PathBuf,
    sys_q: Queue,
    mic_q: Queue,
    stop: Arc<AtomicBool>,
    start_index: u32,
) {
    std::thread::spawn(move || {
        let chunk_limit = CHUNK_SECONDS * TARGET_RATE as u64;
        let frame_len = TARGET_RATE as usize / 10; // 100 ms
        let mut index: u32 = start_index;
        let mut chunk_count: u32 = 0;
        let mut chunk_samples: u64 = 0;
        let mut total_samples: u64 = 0;
        let mut writer: Option<hound::WavWriter<std::io::BufWriter<std::fs::File>>> = None;

        'outer: loop {
            let stopping = stop.load(Ordering::Relaxed);
            if stopping {
                // Let the capture threads deliver their last callbacks first.
                std::thread::sleep(Duration::from_millis(200));
            }

            // Drain everything currently queued, in 100 ms frames.
            loop {
                let frame = mix_frame(&sys_q, &mic_q, frame_len);
                if frame.is_empty() {
                    break;
                }
                if writer.is_none() {
                    match hound::WavWriter::create(chunk_path(&dir, index), wav_spec()) {
                        Ok(w) => {
                            writer = Some(w);
                            chunk_samples = 0;
                        }
                        Err(e) => {
                            emit_error(&app, format!("cannot write recording: {e}"));
                            stop.store(true, Ordering::Relaxed);
                            break 'outer;
                        }
                    }
                }
                if let Some(w) = writer.as_mut() {
                    for s in &frame {
                        if let Err(e) = w.write_sample(*s) {
                            emit_error(&app, format!("recording write failed: {e}"));
                            stop.store(true, Ordering::Relaxed);
                            break 'outer;
                        }
                    }
                }
                chunk_samples += frame.len() as u64;
                total_samples += frame.len() as u64;

                if !stopping && chunk_samples >= chunk_limit {
                    if let Some(w) = writer.take() {
                        if finish_chunk(&app, &meeting_id, w, &chunk_path(&dir, index), index, chunk_samples) {
                            chunk_count += 1;
                        }
                    }
                    index += 1;
                }
            }

            if stopping {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }

        if let Some(w) = writer.take() {
            if finish_chunk(&app, &meeting_id, w, &chunk_path(&dir, index), index, chunk_samples) {
                chunk_count += 1;
            }
        }
        let _ = app.emit(
            "meeting-recording-stopped",
            StoppedPayload {
                meeting_id,
                total_duration_ms: total_samples * 1000 / TARGET_RATE as u64,
                chunk_count,
            },
        );
    });
}

// ---------- recording files on disk ----------

// Meeting IDs come from the webview; they are our own UUIDs, but since they are
// used as directory names, refuse anything that isn't plain [A-Za-z0-9-].
fn safe_meeting_id(id: &str) -> Result<&str, String> {
    if !id.is_empty() && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
        Ok(id)
    } else {
        Err("invalid meeting id".into())
    }
}

fn recordings_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    Ok(dir.join("recordings"))
}

// A crash mid-chunk leaves a WAV whose RIFF/data sizes don't match the file —
// patch them from the actual length so Whisper (and the resume path) can use
// everything that made it to disk. Returns false for files too small to be audio.
fn repair_wav(path: &Path) -> bool {
    use std::io::{Read, Seek, SeekFrom, Write};
    let Ok(mut f) = std::fs::OpenOptions::new().read(true).write(true).open(path) else {
        return false;
    };
    let Ok(meta) = f.metadata() else { return false };
    let len = meta.len();
    if len < 46 {
        return false; // header only / no audio
    }
    let mut header = [0u8; 44];
    if f.read_exact(&mut header).is_err() {
        return false;
    }
    if &header[0..4] != b"RIFF" || &header[8..12] != b"WAVE" || &header[36..40] != b"data" {
        return false;
    }
    let riff_size = (len - 8) as u32;
    let data_size = (len - 44) as u32;
    let stored_riff = u32::from_le_bytes(header[4..8].try_into().unwrap());
    let stored_data = u32::from_le_bytes(header[40..44].try_into().unwrap());
    if stored_riff != riff_size || stored_data != data_size {
        let ok = f.seek(SeekFrom::Start(4)).is_ok()
            && f.write_all(&riff_size.to_le_bytes()).is_ok()
            && f.seek(SeekFrom::Start(40)).is_ok()
            && f.write_all(&data_size.to_le_bytes()).is_ok();
        if !ok {
            return false;
        }
    }
    true
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingChunk {
    pub index: u32,
    pub path: String,
    pub size_bytes: u64,
    pub duration_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingInfo {
    pub meeting_id: String,
    pub chunks: Vec<RecordingChunk>,
}

// ---------- Tauri commands ----------

fn stop_session(state: &tauri::State<'_, MeetingState>) {
    if let Some(session) = state.inner.lock().unwrap().take() {
        session.stop.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn start_meeting_recording(
    app: AppHandle,
    state: tauri::State<'_, MeetingState>,
    opts: StartOpts,
) -> Result<String, String> {
    if !opts.capture_mic && !opts.capture_system {
        return Err("enable at least one of mic / system audio".into());
    }
    let meeting_id = safe_meeting_id(&opts.meeting_id)?.to_string();
    let dir = recordings_root(&app)?.join(&meeting_id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create recording dir: {e}"))?;

    // Replace any previous session.
    stop_session(&state);

    let stop = Arc::new(AtomicBool::new(false));
    let sys_q: Queue = Arc::new(Mutex::new(VecDeque::new()));
    let mic_q: Queue = Arc::new(Mutex::new(VecDeque::new()));
    // Shared peak amplitude, updated by the capture callbacks and emitted to the
    // UI by its own thread below.
    let level: Level = Arc::new(Mutex::new(0.0_f32));

    spawn_writer(
        app.clone(),
        meeting_id,
        dir.clone(),
        sys_q.clone(),
        mic_q.clone(),
        stop.clone(),
        opts.start_index,
    );

    // Input-level meter: emit the peak-since-last-tick every 100 ms so the user
    // can see audio is being captured.
    {
        let level = level.clone();
        let stop = stop.clone();
        let app = app.clone();
        std::thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(100));
                let v = {
                    let mut g = level.lock().unwrap();
                    let v = *g;
                    *g = 0.0;
                    v
                };
                let _ = app.emit("meeting-level", LevelPayload { level: v });
            }
        });
    }

    if opts.capture_mic {
        let q = mic_q.clone();
        let level = level.clone();
        let stop = stop.clone();
        let app = app.clone();
        std::thread::spawn(move || {
            if let Err(e) = run_mic(q, level, stop) {
                emit_error(&app, format!("mic: {e}"));
            }
        });
    }
    if opts.capture_system {
        let q = sys_q.clone();
        let level = level.clone();
        let stop = stop.clone();
        let app = app.clone();
        std::thread::spawn(move || {
            if let Err(e) = run_system(app.clone(), q, level, stop) {
                emit_error(&app, format!("system audio: {e}"));
            }
        });
    }

    *state.inner.lock().unwrap() = Some(Session { stop });
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn stop_meeting_recording(state: tauri::State<'_, MeetingState>) -> Result<(), String> {
    stop_session(&state);
    Ok(())
}

// PUT a finished chunk file to a server-minted Supabase signed upload URL. The
// token in the URL's query string is the authorization; no other credentials
// are involved. The local file is kept — it is only deleted by
// discard_meeting_recording after finalize succeeds.
#[tauri::command]
pub async fn upload_meeting_chunk(
    app: AppHandle,
    path: String,
    signed_url: String,
    content_type: Option<String>,
) -> Result<(), String> {
    let root = recordings_root(&app)?;
    let file = PathBuf::from(&path)
        .canonicalize()
        .map_err(|e| format!("chunk file: {e}"))?;
    if !file.starts_with(&root) {
        return Err("path is not a Jarvis recording".into());
    }
    let bytes = tokio::fs::read(&file)
        .await
        .map_err(|e| format!("read chunk: {e}"))?;
    let mime = content_type.unwrap_or_else(|| "audio/wav".into());

    let client = reqwest::Client::new();
    let mut last_err = String::new();
    for attempt in 0..3u32 {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_secs(2 * attempt as u64)).await;
        }
        let res = client
            .put(&signed_url)
            .header("Content-Type", &mime)
            .body(bytes.clone())
            .send()
            .await;
        match res {
            Ok(r) if r.status().is_success() => return Ok(()),
            Ok(r) => {
                let status = r.status();
                let body = r.text().await.unwrap_or_default();
                last_err = format!("upload failed ({status}): {body}");
            }
            Err(e) => last_err = format!("upload failed: {e}"),
        }
    }
    Err(last_err)
}

// Scan the recordings dir so the webview can resume an interrupted pipeline:
// re-upload whatever is still on disk. Repairs WAV headers of chunks that were
// mid-write when the app died.
#[tauri::command]
pub fn list_meeting_recordings(app: AppHandle) -> Result<Vec<RecordingInfo>, String> {
    let root = recordings_root(&app)?;
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(&root) else {
        return Ok(out); // nothing recorded yet
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let meeting_id = entry.file_name().to_string_lossy().into_owned();
        let mut chunks = Vec::new();
        if let Ok(files) = std::fs::read_dir(&dir) {
            for f in files.flatten() {
                let p = f.path();
                let name = f.file_name().to_string_lossy().into_owned();
                let Some(idx) = name
                    .strip_prefix("chunk-")
                    .and_then(|s| s.strip_suffix(".wav"))
                    .and_then(|s| s.parse::<u32>().ok())
                else {
                    continue;
                };
                if !repair_wav(&p) {
                    continue; // not a usable WAV (header-only crash remnant)
                }
                let size_bytes = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                let duration_ms =
                    (size_bytes.saturating_sub(44) / 2) * 1000 / TARGET_RATE as u64;
                chunks.push(RecordingChunk {
                    index: idx,
                    path: p.to_string_lossy().into_owned(),
                    size_bytes,
                    duration_ms,
                });
            }
        }
        if !chunks.is_empty() {
            chunks.sort_by_key(|c| c.index);
            out.push(RecordingInfo { meeting_id, chunks });
        }
    }
    Ok(out)
}

// Delete a meeting's local audio. Called by the webview after finalize succeeds
// (or from an explicit discard affordance) — never automatically before.
#[tauri::command]
pub fn discard_meeting_recording(app: AppHandle, meeting_id: String) -> Result<(), String> {
    let id = safe_meeting_id(&meeting_id)?;
    let dir = recordings_root(&app)?.join(id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("discard: {e}"))?;
    }
    Ok(())
}
