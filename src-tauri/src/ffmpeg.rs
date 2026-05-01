use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
    pub fps: f64,
    pub bitrate: u64,
    pub duration: f64,
    pub file_size: u64,
    pub file_path: String,
    pub codec: String,
    pub color_space: String,
    pub audio_codec: String,
    pub audio_sample_rate: u32,
    pub audio_channels: u32,
    pub audio_bitrate: u64,
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

fn detect_hw_encoder(ffmpeg: &str) -> &'static str {
    let encoder = if cfg!(target_os = "macos") {
        "h264_videotoolbox"
    } else if cfg!(target_os = "windows") {
        "h264_nvenc"
    } else {
        "libx264"
    };

    // Test if encoder is available
    let output = create_command(ffmpeg)
        .args([
            "-hide_banner",
            "-f",
            "lavfi",
            "-i",
            "nullsrc=s=320x240:d=0.1",
            "-c:v",
            encoder,
            "-f",
            "null",
            "-",
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            println!("Using hardware encoder: {}", encoder);
            encoder
        }
        _ => {
            println!(
                "Hardware encoder {} not available, falling back to libx264",
                encoder
            );
            "libx264"
        }
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
    let mut color_space = String::new();
    let mut audio_codec = String::new();
    let mut audio_sample_rate = 0u32;
    let mut audio_channels = 0u32;
    let mut audio_bitrate = 0u64;

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

            // Parse color space (e.g., "yuv420p" from "h264, yuv420p,")
            if let Some(start) = line.find(&format!("{}, ", codec)) {
                let after_codec = &line[start + codec.len() + 2..];
                if let Some(end) = after_codec.find(',') {
                    color_space = after_codec[..end].trim().to_string();
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
                if *part == "fps" && i > 0 {
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
            if let Some(start) = line.find("Audio: ") {
                let audio_str = &line[start + 7..];
                if let Some(end) = audio_str.find(',') {
                    audio_codec = simplify_codec(audio_str[..end].trim());
                }
            }

            // Parse audio sample rate (e.g., "44100 Hz" from "aac, 44100 Hz,")
            if let Some(start) = line.find(&format!("{}, ", audio_codec)) {
                let after_codec = &line[start + audio_codec.len() + 2..];
                let parts: Vec<&str> = after_codec.split_whitespace().collect();
                for (i, part) in parts.iter().enumerate() {
                    if *part == "Hz" && i > 0 {
                        if let Ok(rate) = parts[i - 1].parse::<u32>() {
                            audio_sample_rate = rate;
                        }
                    }
                    // Parse audio channels (e.g., "stereo" or "5.1")
                    if *part == "stereo" {
                        audio_channels = 2;
                    } else if *part == "mono" {
                        audio_channels = 1;
                    } else if let Some(channel_count) = part.strip_suffix(".1") {
                        if let Ok(ch) = channel_count.parse::<u32>() {
                            audio_channels = ch + 1;
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

    Ok(VideoInfo {
        width,
        height,
        fps,
        bitrate,
        duration,
        file_size,
        file_path: input_path.to_string(),
        codec,
        color_space,
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
) -> Result<FfmpegResult, String> {
    let ffmpeg = ffmpeg_path(app)?;
    println!("FFmpeg path: {}", ffmpeg);
    println!(
        "FFmpeg args: -y -ss {} -i {} -t {} -c copy -avoid_negative_ts 1 {}",
        start_secs, input_path, duration, output_path
    );

    let output = create_command(&ffmpeg)
        .args([
            "-y",
            "-ss",
            &start_secs.to_string(),
            "-i",
            input_path,
            "-t",
            &duration.to_string(),
            "-c",
            "copy",
            "-avoid_negative_ts",
            "1",
            output_path,
        ])
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
) -> Result<FfmpegResult, String> {
    let ffmpeg = ffmpeg_path(app)?;
    let encoder = detect_hw_encoder(&ffmpeg);
    let mut args = vec![
        "-y".to_string(),
        "-ss".to_string(),
        start_secs.to_string(),
        "-i".to_string(),
        input_path.to_string(),
        "-t".to_string(),
        duration.to_string(),
    ];

    // Video filter for resolution and fps
    let mut vf_parts = Vec::new();
    if let (Some(w), Some(h)) = (width, height) {
        vf_parts.push(format!("scale={}:{}", w, h));
    }
    if let Some(f) = fps {
        vf_parts.push(format!("fps={}", f));
    }
    if !vf_parts.is_empty() {
        args.push("-vf".to_string());
        args.push(vf_parts.join(","));
    }

    args.push("-c:v".to_string());
    args.push(encoder.to_string());

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
        "128k".to_string(),
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
