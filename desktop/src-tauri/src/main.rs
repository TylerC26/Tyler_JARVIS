// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod meeting;

use meeting::{start_meeting_capture, stop_meeting_capture, MeetingState};

fn main() {
    tauri::Builder::default()
        .manage(MeetingState::default())
        .invoke_handler(tauri::generate_handler![
            start_meeting_capture,
            stop_meeting_capture
        ])
        .run(tauri::generate_context!())
        .expect("error while running Jarvis");
}
