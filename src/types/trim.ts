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
}
