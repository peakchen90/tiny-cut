import { invoke } from "@tauri-apps/api/core";
import type { VideoInfo } from "../types/trim";

interface TrimResult {
  success: boolean;
  message: string;
  output_path: string | null;
}

export async function getVideoInfo(inputPath: string): Promise<VideoInfo> {
  return invoke("get_video_info", { inputPath });
}

export async function checkFileExists(path: string): Promise<boolean> {
  return invoke("check_file_exists", { path });
}

export async function trimVideo(
  inputPath: string,
  outputPath: string,
  startTime: number,
  endTime: number,
  mode: "fast" | "precise",
  width?: number,
  height?: number,
  fps?: number,
  bitrate?: number
): Promise<TrimResult> {
  const startStr = formatSecondsToHms(startTime);
  const endStr = formatSecondsToHms(endTime);
  return invoke("trim_video", {
    inputPath,
    outputPath,
    startTime: startStr,
    endTime: endStr,
    mode,
    width: width || null,
    height: height || null,
    fps: fps || null,
    bitrate: bitrate || null,
  });
}

function formatSecondsToHms(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = (secs % 60).toFixed(3);
  return `${pad(h)}:${pad(m)}:${s}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
