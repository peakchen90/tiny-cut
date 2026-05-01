// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod ffmpeg;
mod video_server;

use std::{
    process::Command,
    sync::atomic::{AtomicU16, Ordering},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager,
};

static VIDEO_PORT: AtomicU16 = AtomicU16::new(0);
const GITHUB_URL: &str = "https://github.com/peakchen90";

struct MenuLabels {
    file: String,
    new_project: String,
    info: String,
    export_video: String,
    help: String,
    github_info: String,
    toggle_devtools: String,
}

fn menu_labels(lang: &str) -> MenuLabels {
    let raw = i18n_json(lang);
    let messages: serde_json::Value = serde_json::from_str(raw).unwrap_or_default();

    MenuLabels {
        file: menu_label(&messages, "file"),
        new_project: menu_label(&messages, "newProject"),
        info: menu_label(&messages, "info"),
        export_video: menu_label(&messages, "exportVideo"),
        help: menu_label(&messages, "help"),
        github_info: menu_label(&messages, "githubInfo"),
        toggle_devtools: menu_label(&messages, "toggleDevTools"),
    }
}

fn i18n_json(lang: &str) -> &'static str {
    let lang = lang.to_lowercase().replace('_', "-");
    if lang.starts_with("zh") {
        if lang.contains("hant")
            || lang.contains("tw")
            || lang.contains("hk")
            || lang.contains("mo")
        {
            return include_str!("../../i18n/zh-Hant.json");
        }
        return include_str!("../../i18n/zh.json");
    }
    if lang.starts_with("de") {
        return include_str!("../../i18n/de.json");
    }
    if lang.starts_with("es") {
        return include_str!("../../i18n/es.json");
    }
    if lang.starts_with("fr") {
        return include_str!("../../i18n/fr.json");
    }
    if lang.starts_with("ja") {
        return include_str!("../../i18n/ja.json");
    }
    if lang.starts_with("ko") {
        return include_str!("../../i18n/ko.json");
    }
    include_str!("../../i18n/en.json")
}

fn menu_label(messages: &serde_json::Value, key: &str) -> String {
    messages
        .get("menu")
        .and_then(|menu| menu.get(key))
        .and_then(|value| value.as_str())
        .unwrap_or_else(|| panic!("missing i18n key: menu.{key}"))
        .to_string()
}

fn system_menu_lang() -> String {
    std::env::var("LC_ALL")
        .or_else(|_| std::env::var("LANG"))
        .unwrap_or_default()
}

fn build_app_menu<R: tauri::Runtime>(
    handle: &tauri::AppHandle<R>,
    lang: &str,
    has_video: bool,
) -> tauri::Result<Menu<R>> {
    let labels = menu_labels(lang);
    let new_project = MenuItem::with_id(
        handle,
        "file-new-project",
        labels.new_project,
        true,
        Some("CmdOrCtrl+N"),
    )?;
    let info = MenuItem::with_id(handle, "file-info", labels.info, true, Some("CmdOrCtrl+I"))?;
    let export_video = MenuItem::with_id(
        handle,
        "file-export-video",
        labels.export_video,
        true,
        Some("CmdOrCtrl+E"),
    )?;

    let file_menu = if has_video {
        Submenu::with_id_and_items(
            handle,
            "file-menu",
            labels.file,
            true,
            &[&new_project, &info, &export_video],
        )?
    } else {
        Submenu::with_id_and_items(handle, "file-menu", labels.file, true, &[&new_project])?
    };

    let github_info = MenuItem::with_id(
        handle,
        "help-github-info",
        labels.github_info,
        true,
        None::<&str>,
    )?;
    let toggle_devtools = MenuItem::with_id(
        handle,
        "help-toggle-devtools",
        labels.toggle_devtools,
        true,
        None::<&str>,
    )?;
    let help_menu = Submenu::with_id_and_items(
        handle,
        "help-menu",
        labels.help,
        true,
        &[&github_info, &toggle_devtools],
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
                    &PredefinedMenuItem::hide(handle, None)?,
                    &PredefinedMenuItem::hide_others(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::quit(handle, None)?,
                ],
            )?,
            &file_menu,
            &help_menu,
        ],
    )
}

#[tauri::command]
fn get_video_port() -> u16 {
    VIDEO_PORT.load(Ordering::Relaxed)
}

#[tauri::command]
fn set_menu_state(app: tauri::AppHandle, lang: String, has_video: bool) -> Result<(), String> {
    let menu = build_app_menu(&app, &lang, has_video).map_err(|err| err.to_string())?;
    app.set_menu(menu).map_err(|err| err.to_string())?;
    Ok(())
}

fn main() {
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
    let port = rt.block_on(video_server::start());
    VIDEO_PORT.store(port, Ordering::Relaxed);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .menu(|handle| build_app_menu(handle, &system_menu_lang(), false))
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
            "help-github-info" => {
                #[cfg(target_os = "macos")]
                let _ = Command::new("open").arg(GITHUB_URL).spawn();
                #[cfg(target_os = "windows")]
                let _ = Command::new("cmd")
                    .args(["/C", "start", "", GITHUB_URL])
                    .spawn();
                #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
                let _ = Command::new("xdg-open").arg(GITHUB_URL).spawn();
            }
            "help-toggle-devtools" => {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_devtools_open() {
                        window.close_devtools();
                    } else {
                        window.open_devtools();
                    }
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::trim_video,
            commands::get_video_info,
            commands::check_file_exists,
            get_video_port,
            set_menu_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
