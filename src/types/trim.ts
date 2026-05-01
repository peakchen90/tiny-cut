export interface TrimRange {
  startTime: number;
  endTime: number;
}

export type ExportMode = "fast" | "precise";

export type ExportStatus = "idle" | "exporting" | "success" | "error";

export interface VideoInfo {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  duration: number;
  file_size: number;
  file_path: string;
  codec: string;
  audio_codec: string;
  audio_sample_rate: number;
  audio_channels: number;
  audio_bitrate: number;
}
