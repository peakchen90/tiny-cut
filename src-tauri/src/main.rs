// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod ffmpeg;
mod video_server;

use std::sync::atomic::{AtomicU16, Ordering};
use tauri::{window::Color, Manager};

static VIDEO_PORT: AtomicU16 = AtomicU16::new(0);

#[tauri::command]
fn get_video_port() -> u16 {
    VIDEO_PORT.load(Ordering::Relaxed)
}

fn main() {
    #[cfg(target_os = "macos")]
    {
        use objc2::ClassType;
        use objc2_foundation::{ns_string, NSArray, NSString, NSUserDefaults};

        if let Ok(output) = std::process::Command::new("defaults")
            .args(["read", "-g", "AppleLanguages"])
            .output()
        {
            let languages: Vec<String> = String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter_map(|line| {
                    let value = line.trim().trim_end_matches(',');
                    if value.starts_with('"') && value.ends_with('"') {
                        Some(value.trim_matches('"').to_string())
                    } else {
                        None
                    }
                })
                .collect();

            if !languages.is_empty() {
                let ns_languages: Vec<_> = languages
                    .iter()
                    .map(|language| NSString::from_str(language))
                    .collect();
                let language_refs: Vec<_> =
                    ns_languages.iter().map(|language| &**language).collect();
                let languages = NSArray::from_slice(&language_refs);

                unsafe {
                    NSUserDefaults::standardUserDefaults().setObject_forKey(
                        Some(languages.as_super().as_super()),
                        ns_string!("AppleLanguages"),
                    );
                }
            }
        }

        let locale = std::env::var("LC_ALL")
            .or_else(|_| std::env::var("LANG"))
            .unwrap_or_default();

        if locale.is_empty() || locale == "C" || locale == "C.UTF-8" {
            if let Ok(output) = std::process::Command::new("defaults")
                .args(["read", "-g", "AppleLocale"])
                .output()
            {
                let apple_locale = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !apple_locale.is_empty() {
                    std::env::set_var("LANG", format!("{apple_locale}.UTF-8"));
                    std::env::set_var("LC_ALL", format!("{apple_locale}.UTF-8"));
                }
            }
        }
    }

    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
    let port = rt.block_on(video_server::start());
    VIDEO_PORT.store(port, Ordering::Relaxed);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    window.set_decorations(true)?;
                    window.set_title_bar_style(tauri::TitleBarStyle::Overlay)?;
                }

                #[cfg(target_os = "windows")]
                {
                    window.set_decorations(false)?;
                }

                window.set_background_color(Some(Color(0, 0, 0, 255)))?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::trim_video,
            commands::get_video_info,
            commands::check_file_exists,
            get_video_port
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
