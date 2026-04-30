use serde::Serialize;
use std::process::Command;
use tauri::Manager;

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
}

fn ffmpeg_path(app: &tauri::AppHandle) -> String {
    let bin_name = if cfg!(target_os = "windows") {
        "ffmpeg-x86_64-pc-windows-msvc.exe"
    } else if cfg!(target_arch = "aarch64") {
        "ffmpeg-aarch64-apple-darwin"
    } else {
        "ffmpeg-x86_64-apple-darwin"
    };
    // Try resource_dir first (production), fall back to src-tauri/binaries (dev)
    if let Ok(resource) = app.path().resource_dir() {
        let prod_path = resource.join("binaries").join(bin_name);
        if prod_path.exists() {
            return prod_path.to_string_lossy().to_string();
        }
    }
    // Development: resolve from Cargo manifest dir (src-tauri)
    let dev_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(bin_name);
    dev_path.to_string_lossy().to_string()
}

fn ffprobe_path(app: &tauri::AppHandle) -> String {
    ffmpeg_path(app).replace("ffmpeg", "ffprobe")
}

pub fn get_video_info(app: &tauri::AppHandle, input_path: &str) -> Result<VideoInfo, String> {
    let ffmpeg = ffmpeg_path(app);
    println!("get_video_info: ffmpeg path = {}", ffmpeg);
    println!("get_video_info: input_path = {}", input_path);

    let output = Command::new(&ffmpeg)
        .args(["-i", input_path])
        .output()
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

    // ffmpeg -i outputs to stderr
    let stderr = String::from_utf8_lossy(&output.stderr);
    println!("get_video_info: stderr = {}", &stderr[..stderr.len().min(500)]);

    let mut width = 0u32;
    let mut height = 0u32;
    let mut fps = 30.0f64;
    let mut bitrate = 0u64;
    let mut duration = 0.0f64;

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

    Ok(VideoInfo {
        width,
        height,
        fps,
        bitrate,
        duration,
    })
}

pub fn estimate_bitrate(
    app: &tauri::AppHandle,
    input_path: &str,
    start_secs: f64,
    duration: f64,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
) -> Result<u64, String> {
    let ffmpeg = ffmpeg_path(app);
    let sample_duration = duration.min(1.0);
    
    // Create temp file path
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join("tiny_cut_estimate.mp4");
    let temp_path_str = temp_path.to_string_lossy().to_string();
    
    let mut args = vec![
        "-y".to_string(),
        "-ss".to_string(), format!("{:.3}", start_secs),
        "-i".to_string(), input_path.to_string(),
        "-t".to_string(), format!("{:.3}", sample_duration),
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

    args.extend_from_slice(&[
        "-c:v".to_string(), "libx264".to_string(),
        "-c:a".to_string(), "aac".to_string(),
        temp_path_str.clone(),
    ]);

    let output = Command::new(&ffmpeg)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = std::fs::remove_file(&temp_path);
        return Err(format!("FFmpeg error: {}", stderr));
    }

    // Get temp file size
    let file_size = std::fs::metadata(&temp_path)
        .map(|m| m.len())
        .unwrap_or(0);
    
    // Clean up temp file
    let _ = std::fs::remove_file(&temp_path);
    
    if file_size == 0 {
        return Err("Failed to estimate bitrate: empty output".into());
    }
    
    // Calculate bitrate: file_size (bytes) * 8 / sample_duration (seconds) = bits per second
    let bitrate = (file_size as f64 * 8.0) / sample_duration;
    
    Ok(bitrate as u64)
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

pub fn trim_fast(
    app: &tauri::AppHandle,
    input_path: &str,
    output_path: &str,
    start_secs: f64,
    duration: f64,
) -> Result<FfmpegResult, String> {
    let ffmpeg = ffmpeg_path(app);
    println!("FFmpeg path: {}", ffmpeg);
    println!("FFmpeg args: -y -ss {} -i {} -t {} -c copy -avoid_negative_ts 1 {}", 
        start_secs, input_path, duration, output_path);

    let output = Command::new(&ffmpeg)
        .args([
            "-y",
            "-ss", &start_secs.to_string(),
            "-i", input_path,
            "-t", &duration.to_string(),
            "-c", "copy",
            "-avoid_negative_ts", "1",
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

pub fn trim_precise(
    app: &tauri::AppHandle,
    input_path: &str,
    output_path: &str,
    start_secs: f64,
    duration: f64,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
) -> Result<FfmpegResult, String> {
    let ffmpeg = ffmpeg_path(app);
    let mut args = vec![
        "-y".to_string(),
        "-ss".to_string(), start_secs.to_string(),
        "-i".to_string(), input_path.to_string(),
        "-t".to_string(), duration.to_string(),
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

    args.extend_from_slice(&[
        "-c:v".to_string(), "libx264".to_string(),
        "-c:a".to_string(), "aac".to_string(),
        "-movflags".to_string(), "+faststart".to_string(),
        output_path.to_string(),
    ]);

    let output = Command::new(&ffmpeg)
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
