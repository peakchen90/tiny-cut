use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{command, AppHandle};

use crate::ffmpeg;

#[derive(Serialize)]
pub struct TrimResult {
    success: bool,
    message: String,
    output_path: Option<String>,
}

fn get_unique_path(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }

    let ext = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let stem = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let parent = path
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));

    // Remove existing (n) suffix if any
    let clean_stem = if let Some(idx) = stem.rfind('(') {
        if stem.ends_with(')') {
            &stem[..idx]
        } else {
            &stem
        }
    } else {
        &stem
    };

    let mut counter = 2;
    loop {
        let new_name = if ext.is_empty() {
            format!("{}({})", clean_stem, counter)
        } else {
            format!("{}({}).{}", clean_stem, counter, ext)
        };
        let new_path = parent.join(new_name);
        if !new_path.exists() {
            return new_path;
        }
        counter += 1;
    }
}

#[command]
pub async fn check_file_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

#[command]
pub async fn get_video_info(
    app: AppHandle,
    input_path: String,
) -> Result<ffmpeg::VideoInfo, String> {
    let input = PathBuf::from(&input_path);
    if !input.exists() {
        return Err("Input file does not exist".into());
    }
    ffmpeg::get_video_info(&app, &input_path)
}

#[command]
#[allow(clippy::too_many_arguments)]
pub async fn trim_video(
    app: AppHandle,
    input_path: String,
    output_path: String,
    start_time: String,
    end_time: String,
    mode: String,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
    bitrate: Option<u64>,
    video_codec: Option<String>,
    audio_bitrate: Option<u64>,
) -> Result<TrimResult, String> {
    let input = PathBuf::from(&input_path);
    if !input.exists() {
        return Err("Input file does not exist".into());
    }

    // Ensure output path is unique (don't overwrite existing files)
    let output = PathBuf::from(&output_path);
    let final_output = get_unique_path(&output);
    let final_path = final_output.to_string_lossy().to_string();

    // Create output directory if it doesn't exist
    if let Some(parent) = final_output.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create output directory: {}", e))?;
        }
    }

    let start_secs = parse_time_to_secs(&start_time)?;
    let end_secs = parse_time_to_secs(&end_time)?;

    if start_secs < 0.0 {
        return Err("Start time cannot be negative".into());
    }
    if end_secs <= start_secs {
        return Err("End time must be greater than start time".into());
    }

    let duration = end_secs - start_secs;

    let result = match mode.as_str() {
        "fast" => ffmpeg::trim_fast(
            &app,
            &input_path,
            &final_path,
            start_secs,
            duration,
            video_codec.as_deref(),
        )?,
        "audio" => ffmpeg::trim_audio(
            &app,
            &input_path,
            &final_path,
            start_secs,
            duration,
            audio_bitrate,
            video_codec.as_deref(),
        )?,
        "precise" => ffmpeg::trim_precise(
            &app,
            &input_path,
            &final_path,
            start_secs,
            duration,
            width,
            height,
            fps,
            bitrate,
            video_codec,
            audio_bitrate,
        )?,
        _ => return Err(format!("Unknown mode: {}", mode)),
    };

    Ok(TrimResult {
        success: result.success,
        message: result.message,
        output_path: result.output_path,
    })
}

fn parse_time_to_secs(time: &str) -> Result<f64, String> {
    let parts: Vec<&str> = time.split(':').collect();
    match parts.len() {
        3 => {
            let h: f64 = parts[0].parse().map_err(|_| "Invalid hours")?;
            let m: f64 = parts[1].parse().map_err(|_| "Invalid minutes")?;
            let s: f64 = parts[2].parse().map_err(|_| "Invalid seconds")?;
            Ok(h * 3600.0 + m * 60.0 + s)
        }
        1 => time.parse().map_err(|_| "Invalid time format".into()),
        _ => Err("Time format should be HH:MM:SS or seconds".into()),
    }
}
