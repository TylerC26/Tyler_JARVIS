// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod meeting;

use meeting::{
    discard_meeting_recording, list_meeting_recordings, start_meeting_recording,
    stop_meeting_recording, upload_meeting_chunk, MeetingState,
};

fn main() {
    tauri::Builder::default()
        .manage(MeetingState::default())
        .invoke_handler(tauri::generate_handler![
            start_meeting_recording,
            stop_meeting_recording,
            upload_meeting_chunk,
            list_meeting_recordings,
            discard_meeting_recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running Jarvis");
}
