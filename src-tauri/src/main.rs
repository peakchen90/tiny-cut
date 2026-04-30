// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod ffmpeg;
mod video_server;

use std::sync::atomic::{AtomicU16, Ordering};

static VIDEO_PORT: AtomicU16 = AtomicU16::new(0);

#[tauri::command]
fn get_video_port() -> u16 {
    VIDEO_PORT.load(Ordering::Relaxed)
}

fn main() {
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
    let port = rt.block_on(video_server::start());
    VIDEO_PORT.store(port, Ordering::Relaxed);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::trim_video,
            commands::get_video_info,
            commands::check_file_exists,
            commands::estimate_bitrate,
            get_video_port
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
