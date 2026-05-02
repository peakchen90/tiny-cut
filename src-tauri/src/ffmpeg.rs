use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const ENCODER_CACHE_TTL_SECS: u64 = 24 * 60 * 60;

fn create_command(program: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new(program);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new(program)
    }
}

#[derive(Serialize)]
pub struct FfmpegResult {
    pub success: bool,
    pub message: String,
    pub output_path: Option<String>,
}

#[derive(Serialize)]
pub struct VideoInfo {
    pub width: u32,
    pub height: u32,
    pub rotation: i32,
    pub fps: f64,
    pub bitrate: u64,
    pub duration: f64,
    pub file_size: u64,
    pub file_path: String,
    pub codec: String,
    pub audio_codec: String,
    pub audio_sample_rate: u32,
    pub audio_channels: u32,
    pub audio_bitrate: u64,
}

struct VideoEncoder {
    name: String,
}

#[derive(Deserialize, Serialize)]
struct VideoEncoderCache {
    encoder: String,
    created_at: u64,
}

fn ffmpeg_path(app: &tauri::AppHandle) -> Result<String, String> {
    let sidecar_name = if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    let bin_name = if cfg!(target_os = "windows") {
        "ffmpeg-x86_64-pc-windows-msvc.exe"
    } else if cfg!(target_arch = "aarch64") {
        "ffmpeg-aarch64-apple-darwin"
    } else {
        "ffmpeg-x86_64-apple-darwin"
    };

    let mut candidates: Vec<PathBuf> = Vec::new();

    // Tauri sidecars are bundled without the target triple suffix.
    if let Ok(resource) = app.path().resource_dir() {
        candidates.push(resource.join(sidecar_name));
        candidates.push(resource.join("binaries").join(bin_name));

        if let Some(contents_dir) = resource.parent() {
            candidates.push(contents_dir.join("MacOS").join(sidecar_name));
            candidates.push(contents_dir.join("MacOS").join(bin_name));
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push(exe_dir.join(sidecar_name));
            candidates.push(exe_dir.join(bin_name));
            candidates.push(exe_dir.join("binaries").join(bin_name));
        }
    }

    candidates.push(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(bin_name),
    );

    for candidate in &candidates {
        if candidate.is_file() {
            return Ok(candidate.to_string_lossy().to_string());
        }
    }

    Err(format!(
        "FFmpeg binary not found. Checked: {}",
        candidates
            .iter()
            .map(|path| path.to_string_lossy())
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

fn video_rotation(ffmpeg: &str, input_path: &str) -> Result<i32, String> {
    let output = create_command(ffmpeg)
        .args(["-i", input_path])
        .output()
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

    Ok(parse_rotation(&String::from_utf8_lossy(&output.stderr)))
}

fn parse_rotation(stderr: &str) -> i32 {
    for line in stderr.lines() {
        let lower = line.to_lowercase();
        if lower.contains("rotation of") {
            if let Some(value) = lower
                .split("rotation of")
                .nth(1)
                .and_then(|value| value.split_whitespace().next())
                .and_then(|value| value.parse::<f64>().ok())
            {
                return normalize_rotation(value);
            }
        }

        if lower.contains("rotate") {
            if let Some(value) = line
                .rsplit(':')
                .next()
                .and_then(|value| value.trim().parse::<f64>().ok())
            {
                return normalize_rotation(value);
            }
        }
    }
    0
}

fn normalize_rotation(rotation: f64) -> i32 {
    let rounded = rotation.round() as i32;
    ((rounded % 360) + 360) % 360
}

fn detect_hw_encoder(
    app: &tauri::AppHandle,
    ffmpeg: &str,
    video_codec: Option<&str>,
) -> Result<VideoEncoder, String> {
    let codec = video_codec.unwrap_or("").to_lowercase();
    let is_h265 = codec.contains("h265") || codec.contains("h.265") || codec.contains("hevc");
    let cache_key = if is_h265 { "h265" } else { "h264" };

    if let Some(encoder) = read_encoder_cache(app, cache_key) {
        return Ok(encoder);
    }

    let fallback = if is_h265 { "libx265" } else { "libx264" };
    let encoders: &[&str] = if is_h265 {
        if cfg!(target_os = "macos") {
            &["hevc_videotoolbox"]
        } else if cfg!(target_os = "windows") {
            &["hevc_nvenc", "hevc_qsv", "hevc_amf"]
        } else {
            &[]
        }
    } else if cfg!(target_os = "macos") {
        &["h264_videotoolbox"]
    } else if cfg!(target_os = "windows") {
        &["h264_nvenc", "h264_qsv", "h264_amf"]
    } else {
        &[]
    };

    // Test hardware encoders in vendor order before falling back to CPU encoding.
    for encoder in encoders {
        let output = create_command(ffmpeg)
            .args([
                "-hide_banner",
                "-f",
                "lavfi",
                "-i",
                "nullsrc=s=640x360:d=0.1",
                "-c:v",
                encoder,
                "-frames:v",
                "1",
                "-f",
                "null",
                "-",
            ])
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                println!("Using hardware encoder: {}", encoder);
                write_encoder_cache(app, cache_key, encoder);
                return Ok(VideoEncoder {
                    name: encoder.to_string(),
                });
            }
        }

        println!("Hardware encoder {} not available", encoder);
    }

    println!(
        "No hardware encoder available, falling back to {}",
        fallback
    );
    write_encoder_cache(app, cache_key, fallback);
    Ok(VideoEncoder {
        name: fallback.to_string(),
    })
}

fn encoder_cache_path(app: &tauri::AppHandle, cache_key: &str) -> Option<PathBuf> {
    app.path().app_cache_dir().ok().map(|dir| {
        dir.join("ffmpeg-encoder-cache")
            .join(format!("{}.json", cache_key))
    })
}

fn current_timestamp_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn is_cached_encoder_valid(cache_key: &str, encoder: &str) -> bool {
    match cache_key {
        "h265" => matches!(
            encoder,
            "hevc_videotoolbox" | "hevc_nvenc" | "hevc_qsv" | "hevc_amf" | "libx265"
        ),
        _ => matches!(
            encoder,
            "h264_videotoolbox" | "h264_nvenc" | "h264_qsv" | "h264_amf" | "libx264"
        ),
    }
}

fn read_encoder_cache(app: &tauri::AppHandle, cache_key: &str) -> Option<VideoEncoder> {
    let cache_path = encoder_cache_path(app, cache_key)?;
    let cache =
        serde_json::from_str::<VideoEncoderCache>(&std::fs::read_to_string(cache_path).ok()?)
            .ok()?;
    let is_expired =
        current_timestamp_secs().saturating_sub(cache.created_at) > ENCODER_CACHE_TTL_SECS;
    if is_expired || !is_cached_encoder_valid(cache_key, &cache.encoder) {
        return None;
    }

    println!("Using cached video encoder: {}", cache.encoder);
    Some(VideoEncoder {
        name: cache.encoder,
    })
}

fn write_encoder_cache(app: &tauri::AppHandle, cache_key: &str, encoder: &str) {
    let Some(cache_path) = encoder_cache_path(app, cache_key) else {
        return;
    };
    if let Some(parent) = cache_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let cache = VideoEncoderCache {
        encoder: encoder.to_string(),
        created_at: current_timestamp_secs(),
    };
    if let Ok(content) = serde_json::to_string(&cache) {
        let _ = std::fs::write(cache_path, content);
    }
}

pub fn get_video_info(app: &tauri::AppHandle, input_path: &str) -> Result<VideoInfo, String> {
    let ffmpeg = ffmpeg_path(app)?;
    println!("get_video_info: ffmpeg path = {}", ffmpeg);
    println!("get_video_info: input_path = {}", input_path);

    // Get file size
    let file_size = std::fs::metadata(input_path).map(|m| m.len()).unwrap_or(0);

    let output = create_command(&ffmpeg)
        .args(["-i", input_path])
        .output()
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

    // ffmpeg -i outputs to stderr
    let stderr = String::from_utf8_lossy(&output.stderr);
    println!(
        "get_video_info: stderr = {}",
        &stderr[..stderr.len().min(500)]
    );

    let mut width = 0u32;
    let mut height = 0u32;
    let mut fps = 30.0f64;
    let mut bitrate = 0u64;
    let mut duration = 0.0f64;
    let mut codec = String::new();
    let mut audio_codec = String::new();
    let mut audio_sample_rate = 0u32;
    let mut audio_channels = 0u32;
    let mut audio_bitrate = 0u64;
    let rotation = parse_rotation(&stderr);

    // Parse duration (e.g., "Duration: 00:01:23.45")
    if let Some(dur_line) = stderr.lines().find(|l| l.contains("Duration:")) {
        if let Some(start) = dur_line.find("Duration: ") {
            let dur_str = &dur_line[start + 10..];
            if let Some(end) = dur_str.find(',') {
                let time_str = dur_str[..end].trim();
                duration = parse_time_str(time_str);
            }
        }
        // Parse bitrate (e.g., "bitrate: 1234 kb/s")
        if let Some(start) = dur_line.find("bitrate: ") {
            let bitrate_str = &dur_line[start + 9..];
            if let Some(end) = bitrate_str.find(" kb/s") {
                bitrate = bitrate_str[..end].trim().parse::<u64>().unwrap_or(0) * 1000;
            }
        }
    }

    // Parse video stream (e.g., "Video: h264, yuv420p, 1920x1080 [SAR 1:1 DAR 16:9], 30 fps")
    for line in stderr.lines() {
        if line.contains("Video:") {
            // Parse codec (e.g., "h264" from "Video: h264,")
            if let Some(start) = line.find("Video: ") {
                let video_str = &line[start + 7..];
                if let Some(end) = video_str.find(',') {
                    codec = simplify_codec(video_str[..end].trim());
                }
            }

            // Parse resolution (e.g., "1920x1080" or "1920x1080,")
            let parts: Vec<&str> = line.split_whitespace().collect();
            for (i, part) in parts.iter().enumerate() {
                if part.contains('x') && !part.starts_with("0x") {
                    let res: Vec<&str> = part.split('x').collect();
                    if res.len() >= 2 {
                        let w_str = res[0];
                        let h_str = res[1].trim_end_matches(|c: char| !c.is_ascii_digit());
                        if let (Ok(w), Ok(h)) = (w_str.parse::<u32>(), h_str.parse::<u32>()) {
                            if w > 0 && h > 0 && w < 100000 && h < 100000 {
                                width = w;
                                height = h;
                            }
                        }
                    }
                }
                // Parse fps (e.g., "30 fps" or "29.97 fps")
                if part.trim_end_matches(|c: char| !c.is_alphanumeric()) == "fps" && i > 0 {
                    if let Ok(f) = parts[i - 1].parse::<f64>() {
                        fps = f;
                    }
                }
            }
            break;
        }
    }

    // Parse audio stream (e.g., "Audio: aac, 44100 Hz, stereo, 128 kb/s")
    for line in stderr.lines() {
        if line.contains("Audio:") {
            // Parse audio codec (e.g., "aac" from "Audio: aac,")
            let raw_audio_codec;
            if let Some(start) = line.find("Audio: ") {
                let audio_str = &line[start + 7..];
                if let Some(end) = audio_str.find(',') {
                    raw_audio_codec = audio_str[..end].trim().to_string();
                    audio_codec = simplify_codec(&raw_audio_codec);
                } else {
                    raw_audio_codec = String::new();
                }
            } else {
                raw_audio_codec = String::new();
            }

            // Parse audio sample rate (e.g., "44100 Hz" from "aac, 44100 Hz,")
            if !raw_audio_codec.is_empty() {
                if let Some(start) = line.find(&format!("{}, ", raw_audio_codec)) {
                    let after_codec = &line[start + raw_audio_codec.len() + 2..];
                    let parts: Vec<&str> = after_codec.split_whitespace().collect();
                    for (i, part) in parts.iter().enumerate() {
                        let clean = part.trim_end_matches(|c: char| !c.is_alphanumeric());
                        if clean == "Hz" && i > 0 {
                            if let Ok(rate) = parts[i - 1].parse::<u32>() {
                                audio_sample_rate = rate;
                            }
                        }
                        // Parse audio channels (e.g., "stereo" or "5.1")
                        if clean == "stereo" {
                            audio_channels = 2;
                        } else if clean == "mono" {
                            audio_channels = 1;
                        } else if let Some(channel_count) = clean.strip_suffix(".1") {
                            if let Ok(ch) = channel_count.parse::<u32>() {
                                audio_channels = ch + 1;
                            }
                        }
                    }
                }
            }

            // Parse audio bitrate (e.g., "128 kb/s" from "stereo, 128 kb/s")
            if let Some(start) = line.find("kb/s") {
                let before_kb = &line[..start];
                if let Some(comma_pos) = before_kb.rfind(',') {
                    let bitrate_str = before_kb[comma_pos + 1..].trim();
                    if let Ok(rate) = bitrate_str.parse::<u64>() {
                        audio_bitrate = rate * 1000;
                    }
                }
            }
            break;
        }
    }

    if rotation == 90 || rotation == 270 {
        std::mem::swap(&mut width, &mut height);
    }

    Ok(VideoInfo {
        width,
        height,
        rotation,
        fps,
        bitrate,
        duration,
        file_size,
        file_path: input_path.to_string(),
        codec,
        audio_codec,
        audio_sample_rate,
        audio_channels,
        audio_bitrate,
    })
}

fn parse_time_str(time: &str) -> f64 {
    let parts: Vec<&str> = time.split(':').collect();
    if parts.len() != 3 {
        return 0.0;
    }
    let h: f64 = parts[0].parse().unwrap_or(0.0);
    let m: f64 = parts[1].parse().unwrap_or(0.0);
    let s: f64 = parts[2].parse().unwrap_or(0.0);
    h * 3600.0 + m * 60.0 + s
}

fn simplify_codec(codec: &str) -> String {
    let lower = codec.to_lowercase();
    // Video codecs
    if lower.contains("h264") || lower.contains("avc") {
        return "H.264".to_string();
    }
    if lower.contains("h265") || lower.contains("hevc") {
        return "H.265".to_string();
    }
    if lower.contains("vp9") {
        return "VP9".to_string();
    }
    if lower.contains("vp8") {
        return "VP8".to_string();
    }
    if lower.contains("av1") {
        return "AV1".to_string();
    }
    if lower.contains("mpeg4") || lower.contains("mpeg-4") {
        return "MPEG-4".to_string();
    }
    if lower.contains("mpeg2") || lower.contains("mpeg-2") {
        return "MPEG-2".to_string();
    }
    // Audio codecs
    if lower.contains("aac") {
        return "AAC".to_string();
    }
    if lower.contains("mp3") {
        return "MP3".to_string();
    }
    if lower.contains("opus") {
        return "Opus".to_string();
    }
    if lower.contains("flac") {
        return "FLAC".to_string();
    }
    if lower.contains("vorbis") {
        return "Vorbis".to_string();
    }
    if lower.contains("pcm") || lower.contains("s16le") || lower.contains("s32le") {
        return "PCM".to_string();
    }
    if lower.contains("ac3") || lower.contains("eac3") {
        return "AC-3".to_string();
    }
    if lower.contains("dts") {
        return "DTS".to_string();
    }
    // Return original if no match
    codec.to_string()
}

pub fn trim_fast(
    app: &tauri::AppHandle,
    input_path: &str,
    output_path: &str,
    start_secs: f64,
    duration: f64,
    video_codec: Option<&str>,
) -> Result<FfmpegResult, String> {
    let ffmpeg = ffmpeg_path(app)?;
    println!("FFmpeg path: {}", ffmpeg);
    let mut args = vec![
        "-y".to_string(),
        "-ss".to_string(),
        start_secs.to_string(),
        "-i".to_string(),
        input_path.to_string(),
        "-t".to_string(),
        duration.to_string(),
        "-c".to_string(),
        "copy".to_string(),
    ];
    if video_codec
        .map(|codec| {
            let lower = codec.to_lowercase();
            lower.contains("h265") || lower.contains("h.265") || lower.contains("hevc")
        })
        .unwrap_or(false)
    {
        args.push("-tag:v".to_string());
        args.push("hvc1".to_string());
    }
    args.extend_from_slice(&[
        "-avoid_negative_ts".to_string(),
        "1".to_string(),
        output_path.to_string(),
    ]);

    let output = create_command(&ffmpeg)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

    println!("FFmpeg exit status: {}", output.status);
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        println!("FFmpeg stderr: {}", stderr);
    }

    if output.status.success() {
        Ok(FfmpegResult {
            success: true,
            message: "Fast trim completed".into(),
            output_path: Some(output_path.into()),
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("FFmpeg error: {}", stderr))
    }
}

pub fn trim_audio(
    app: &tauri::AppHandle,
    input_path: &str,
    output_path: &str,
    start_secs: f64,
    duration: f64,
    audio_bitrate: Option<u64>,
    video_codec: Option<&str>,
) -> Result<FfmpegResult, String> {
    let ffmpeg = ffmpeg_path(app)?;
    let bitrate_kbps = audio_bitrate.unwrap_or(128000) / 1000;
    let mut args = vec![
        "-y".to_string(),
        "-ss".to_string(),
        start_secs.to_string(),
        "-i".to_string(),
        input_path.to_string(),
        "-t".to_string(),
        duration.to_string(),
        "-c:v".to_string(),
        "copy".to_string(),
    ];
    if video_codec
        .map(|codec| {
            let lower = codec.to_lowercase();
            lower.contains("h265") || lower.contains("h.265") || lower.contains("hevc")
        })
        .unwrap_or(false)
    {
        args.push("-tag:v".to_string());
        args.push("hvc1".to_string());
    }
    args.extend_from_slice(&[
        "-c:a".to_string(),
        "aac".to_string(),
        "-b:a".to_string(),
        format!("{}k", bitrate_kbps),
        "-movflags".to_string(),
        "+faststart".to_string(),
        "-avoid_negative_ts".to_string(),
        "1".to_string(),
        output_path.to_string(),
    ]);

    let output = create_command(&ffmpeg)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

    if output.status.success() {
        Ok(FfmpegResult {
            success: true,
            message: "Audio trim completed".into(),
            output_path: Some(output_path.into()),
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("FFmpeg error: {}", stderr))
    }
}

#[allow(clippy::too_many_arguments)]
pub fn trim_precise(
    app: &tauri::AppHandle,
    input_path: &str,
    output_path: &str,
    start_secs: f64,
    duration: f64,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
    bitrate: Option<u64>,
    video_codec: Option<String>,
    audio_bitrate: Option<u64>,
) -> Result<FfmpegResult, String> {
    let ffmpeg = ffmpeg_path(app)?;
    let encoder = detect_hw_encoder(app, &ffmpeg, video_codec.as_deref())?;
    let rotation = video_rotation(&ffmpeg, input_path)?;
    let mut args = vec!["-y".to_string(), "-ss".to_string(), start_secs.to_string()];
    if rotation != 0 {
        args.push("-noautorotate".to_string());
    }
    args.extend_from_slice(&[
        "-i".to_string(),
        input_path.to_string(),
        "-t".to_string(),
        duration.to_string(),
    ]);

    // Video filter for resolution and fps
    let mut vf_parts = Vec::new();
    if let (Some(w), Some(h)) = (width, height) {
        if rotation == 90 || rotation == 270 {
            vf_parts.push(format!("scale={}:{}", h, w));
        } else {
            vf_parts.push(format!("scale={}:{}", w, h));
        }
    }
    if let Some(f) = fps {
        vf_parts.push(format!("fps={}", f));
    }
    if !vf_parts.is_empty() {
        args.push("-vf".to_string());
        args.push(vf_parts.join(","));
    }

    args.push("-c:v".to_string());
    args.push(encoder.name.to_string());
    if encoder.name.contains("265") || encoder.name.contains("hevc") {
        args.push("-tag:v".to_string());
        args.push("hvc1".to_string());
    }
    if rotation != 0 {
        args.push("-metadata:s:v:0".to_string());
        args.push(format!("rotate={}", rotation));
    }

    // Set video bitrate if provided
    if let Some(b) = bitrate {
        if b > 0 {
            let bitrate_kbps = b / 1000;
            args.push("-b:v".to_string());
            args.push(format!("{}k", bitrate_kbps));
            // Limit max bitrate to prevent exceeding original size
            args.push("-maxrate".to_string());
            args.push(format!("{}k", bitrate_kbps));
            args.push("-bufsize".to_string());
            args.push(format!("{}k", bitrate_kbps * 2));
        }
    }

    args.extend_from_slice(&[
        "-c:a".to_string(),
        "aac".to_string(),
        "-b:a".to_string(),
        format!("{}k", audio_bitrate.unwrap_or(128000) / 1000),
        "-movflags".to_string(),
        "+faststart".to_string(),
        output_path.to_string(),
    ]);

    let output = create_command(&ffmpeg)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

    if output.status.success() {
        Ok(FfmpegResult {
            success: true,
            message: "Precise trim completed".into(),
            output_path: Some(output_path.into()),
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("FFmpeg error: {}", stderr))
    }
}
