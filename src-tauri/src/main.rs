// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod ffmpeg;
mod video_server;

use std::{
    collections::HashMap,
    sync::atomic::{AtomicU16, Ordering},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    window::Color,
    Emitter, Manager,
};

static VIDEO_PORT: AtomicU16 = AtomicU16::new(0);

struct MenuLabels {
    file: String,
    new_project: String,
    info: String,
    export_video: String,
}

fn menu_labels(lang: &str) -> MenuLabels {
    let raw = if lang.to_lowercase().starts_with("zh") {
        include_str!("../../i18n/zh.json")
    } else {
        include_str!("../../i18n/en.json")
    };
    let messages: HashMap<String, String> = serde_json::from_str(raw).unwrap_or_default();

    MenuLabels {
        file: messages
            .get("file")
            .cloned()
            .unwrap_or_else(|| "File".to_string()),
        new_project: messages
            .get("newProject")
            .cloned()
            .unwrap_or_else(|| "New".to_string()),
        info: messages
            .get("info")
            .cloned()
            .unwrap_or_else(|| "Info".to_string()),
        export_video: messages
            .get("exportVideo")
            .cloned()
            .unwrap_or_else(|| "Export".to_string()),
    }
}

fn system_menu_lang() -> String {
    std::env::var("LC_ALL")
        .or_else(|_| std::env::var("LANG"))
        .unwrap_or_default()
}

#[tauri::command]
fn get_video_port() -> u16 {
    VIDEO_PORT.load(Ordering::Relaxed)
}

#[tauri::command]
fn set_menu_language(app: tauri::AppHandle, lang: String) -> Result<(), String> {
    let labels = menu_labels(&lang);
    let Some(menu) = app.menu() else {
        return Ok(());
    };

    if let Some(item) = menu.get("file-menu") {
        if let Some(submenu) = item.as_submenu() {
            submenu
                .set_text(labels.file)
                .map_err(|err| err.to_string())?;
        }
    }
    if let Some(item) = menu.get("file-new-project") {
        if let Some(menu_item) = item.as_menuitem() {
            menu_item
                .set_text(labels.new_project)
                .map_err(|err| err.to_string())?;
        }
    }
    if let Some(item) = menu.get("file-info") {
        if let Some(menu_item) = item.as_menuitem() {
            menu_item
                .set_text(labels.info)
                .map_err(|err| err.to_string())?;
        }
    }
    if let Some(item) = menu.get("file-export-video") {
        if let Some(menu_item) = item.as_menuitem() {
            menu_item
                .set_text(labels.export_video)
                .map_err(|err| err.to_string())?;
        }
    }

    Ok(())
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
        .menu(|handle| {
            let labels = menu_labels(&system_menu_lang());
            let new_project = MenuItem::with_id(
                handle,
                "file-new-project",
                labels.new_project,
                true,
                Some("CmdOrCtrl+N"),
            )?;
            let info =
                MenuItem::with_id(handle, "file-info", labels.info, true, Some("CmdOrCtrl+I"))?;
            let export_video = MenuItem::with_id(
                handle,
                "file-export-video",
                labels.export_video,
                true,
                Some("CmdOrCtrl+E"),
            )?;

            let file_menu = Submenu::with_id_and_items(
                handle,
                "file-menu",
                labels.file,
                true,
                &[
                    &new_project,
                    &info,
                    &export_video,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::close_window(handle, None)?,
                    #[cfg(not(target_os = "macos"))]
                    &PredefinedMenuItem::quit(handle, None)?,
                ],
            )?;

            Menu::with_items(
                handle,
                &[
                    #[cfg(target_os = "macos")]
                    &Submenu::with_items(
                        handle,
                        handle.package_info().name.clone(),
                        true,
                        &[
                            &PredefinedMenuItem::about(handle, None, None)?,
                            &PredefinedMenuItem::separator(handle)?,
                            &PredefinedMenuItem::services(handle, None)?,
                            &PredefinedMenuItem::separator(handle)?,
                            &PredefinedMenuItem::hide(handle, None)?,
                            &PredefinedMenuItem::hide_others(handle, None)?,
                            &PredefinedMenuItem::separator(handle)?,
                            &PredefinedMenuItem::quit(handle, None)?,
                        ],
                    )?,
                    &file_menu,
                    &Submenu::with_items(
                        handle,
                        "Edit",
                        true,
                        &[
                            &PredefinedMenuItem::undo(handle, None)?,
                            &PredefinedMenuItem::redo(handle, None)?,
                            &PredefinedMenuItem::separator(handle)?,
                            &PredefinedMenuItem::cut(handle, None)?,
                            &PredefinedMenuItem::copy(handle, None)?,
                            &PredefinedMenuItem::paste(handle, None)?,
                            &PredefinedMenuItem::select_all(handle, None)?,
                        ],
                    )?,
                    #[cfg(target_os = "macos")]
                    &Submenu::with_items(
                        handle,
                        "View",
                        true,
                        &[&PredefinedMenuItem::fullscreen(handle, None)?],
                    )?,
                    &Submenu::with_items(
                        handle,
                        "Window",
                        true,
                        &[
                            &PredefinedMenuItem::minimize(handle, None)?,
                            &PredefinedMenuItem::maximize(handle, None)?,
                            #[cfg(target_os = "macos")]
                            &PredefinedMenuItem::separator(handle)?,
                            &PredefinedMenuItem::close_window(handle, None)?,
                        ],
                    )?,
                    &Submenu::with_items(
                        handle,
                        "Help",
                        true,
                        &[
                            #[cfg(not(target_os = "macos"))]
                            &PredefinedMenuItem::about(handle, None, None)?,
                        ],
                    )?,
                ],
            )
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "file-new-project" => {
                let _ = app.emit("file-menu-action", "new-project");
            }
            "file-info" => {
                let _ = app.emit("file-menu-action", "info");
            }
            "file-export-video" => {
                let _ = app.emit("file-menu-action", "export-video");
            }
            _ => {}
        })
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
            get_video_port,
            set_menu_language
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
