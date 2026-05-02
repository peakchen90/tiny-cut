import { useState, useEffect, useMemo, useRef } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { getVideoInfo, trimVideo, checkFileExists } from "../lib/tauri";
import { t } from "../lib/i18n";
import { getFileNameWithoutExtension } from "../lib/path";
import type { VideoInfo, ExportStatus, TrimRange } from "../types/trim";

interface Props {
  filePath: string;
  trimRange: TrimRange;
  onClose: () => void;
  onExportStart: () => void;
  onExportEnd: (status: ExportStatus, message?: string) => void;
}

interface ResolutionOption {
  label: string;
  width: number;
  height: number;
}

interface FpsOption {
  label: string;
  value: number;
}

interface AudioBitrateOption {
  label: string;
  value: number | null;
}

interface VideoCodecOption {
  label: string;
  value: string | null;
}

const FORMAT_OPTIONS = [
  { label: "MP4", value: "mp4", ext: "mp4" },
  { label: "MOV", value: "mov", ext: "mov" },
];

function getResolutionOptions(origW: number, origH: number): ResolutionOption[] {
  const options: ResolutionOption[] = [{ label: `${t("export.original")} (${origW}×${origH})`, width: origW, height: origH }];
  const presets = [
    { label: "4K", w: 3840, h: 2160 },
    { label: "1440p", w: 2560, h: 1440 },
    { label: "1080p", w: 1920, h: 1080 },
    { label: "720p", w: 1280, h: 720 },
    { label: "480p", w: 854, h: 480 },
  ];
  for (const p of presets) {
    if (p.w < origW && p.h < origH) {
      const scale = p.w / origW;
      const h = Math.round(origH * scale / 2) * 2;
      options.push({ label: `${p.label} (${p.w}×${h})`, width: p.w, height: h });
    }
  }
  return options;
}

function getFpsOptions(origFps: number): FpsOption[] {
  const options: FpsOption[] = [{ label: `${t("export.original")} (${origFps} fps)`, value: origFps }];
  const roundedOrigFps = Math.round(origFps);
  const presets = [60, 30, 25, 24];
  for (const f of presets) {
    if (f < roundedOrigFps) {
      options.push({ label: `${f} fps`, value: f });
    }
  }
  return options;
}

function getAudioBitrateOptions(origBitrate: number): AudioBitrateOption[] {
  const originalLabel = origBitrate > 0 ? `${t("export.original")} (${Math.round(origBitrate / 1000)} kbps)` : t("export.original");
  const options: AudioBitrateOption[] = [{ label: originalLabel, value: null }];
  const presets = [256, 192, 128];
  for (const bitrate of presets) {
    if (origBitrate > bitrate * 1000) {
      options.push({ label: `${bitrate} kbps`, value: bitrate * 1000 });
    }
  }
  return options;
}

function getVideoCodecOptions(origCodec: string): VideoCodecOption[] {
  const codecs = ["H.264", "H.265"];
  const options: VideoCodecOption[] = [];
  if (codecs.includes(origCodec)) {
    options.push({ label: `${t("export.original")} (${origCodec})`, value: null });
  }
  for (const codec of codecs) {
    if (codec !== origCodec) {
      options.push({ label: codec, value: codec });
    }
  }
  return options;
}

function getSourceTotalBitrate(info: VideoInfo): number {
  if (info.bitrate > 0) return info.bitrate;
  if (info.file_size > 0 && info.duration > 0) return Math.round(info.file_size * 8 / info.duration);
  return 0;
}

function getCodecKind(codec: string | undefined): "h264" | "h265" | "other" {
  const lower = (codec || "").toLowerCase();
  if (lower.includes("h265") || lower.includes("h.265") || lower.includes("hevc")) return "h265";
  if (lower.includes("h264") || lower.includes("h.264") || lower.includes("avc")) return "h264";
  return "other";
}

function getCodecBitrateScale(sourceCodec: string, targetCodec: string): number {
  const source = getCodecKind(sourceCodec);
  const target = getCodecKind(targetCodec);
  if (source === "h264" && target === "h265") return 0.58;
  if (source === "h265" && target === "h264") return 1.35;
  if (source === "other" && target === "h265") return 0.58;
  return 0.92;
}

function isAudioCopySafeForFormat(format: string, audioCodec: string): boolean {
  if (!audioCodec) return true;
  if (format === "mp4" || format === "mov") {
    return audioCodec === "AAC" || audioCodec === "MP3";
  }
  return true;
}

function estimateVideoBitrate(info: VideoInfo, width: number, height: number, fps: number, videoCodec: string): number {
  const totalBitrate = getSourceTotalBitrate(info);
  const audioBitrate = info.audio_bitrate || 0;
  const sourceVideoBitrate = Math.max(totalBitrate - audioBitrate, 0);
  const sourcePixels = Math.max(info.width * info.height, 1);
  const targetPixels = Math.max(width * height, 1);
  const sourceFps = info.fps > 0 ? info.fps : fps;
  const pixelScale = targetPixels / sourcePixels;
  const fpsScale = fps / sourceFps;
  return Math.max(Math.round(sourceVideoBitrate * pixelScale * fpsScale * getCodecBitrateScale(info.codec, videoCodec)), 0);
}

export default function ExportModal({ filePath, trimRange, onClose, onExportStart, onExportEnd }: Props) {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolutionIdx, setResolutionIdx] = useState(0);
  const [fpsIdx, setFpsIdx] = useState(0);
  const [audioBitrateIdx, setAudioBitrateIdx] = useState(0);
  const [videoCodecIdx, setVideoCodecIdx] = useState(0);
  const [formatIdx, setFormatIdx] = useState(0);
  const [outputPath, setOutputPath] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [estimatedBitrate, setEstimatedBitrate] = useState<number>(0);
  const selectedDirRef = useRef("");

  useEffect(() => {
    getVideoInfo(filePath)
      .then((info) => {
        setVideoInfo(info);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [filePath]);

  useEffect(() => {
    selectedDirRef.current = "";
  }, [filePath]);

  useEffect(() => {
    const fmt = FORMAT_OPTIONS[formatIdx];
    const defaultName = getFileNameWithoutExtension(filePath);
    // Get directory path, handle both Windows and macOS paths
    const dirMatch = filePath.match(/^(.*?)[/\\][^/\\]+$/);
    const dir = selectedDirRef.current || (dirMatch ? dirMatch[1] : '');
    const now = new Date();
    const ts = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    // Use the same path separator as the original path
    const separator = dir.includes('\\') || filePath.includes('\\') ? '\\' : '/';
    setOutputPath(`${dir}${separator}${defaultName}_${ts}.${fmt.ext}`);
  }, [filePath, formatIdx]);

  // Check for duplicate filename and add (n) suffix
  useEffect(() => {
    if (!outputPath) return;
    const timer = setTimeout(async () => {
      let path = outputPath;
      let counter = 2;
      try {
        const exists = await checkFileExists(path);
        console.log("Checking:", path, "exists:", exists);
        while (exists) {
          const ext = path.split('.').pop();
          const base = path.substring(0, path.lastIndexOf('.'));
          // Remove existing (n) suffix if any
          const cleanBase = base.replace(/\(\d+\)$/, '');
          path = `${cleanBase}(${counter}).${ext}`;
          counter++;
          const nextExists = await checkFileExists(path);
          if (!nextExists) break;
        }
        if (path !== outputPath) {
          console.log("Updating path to:", path);
          setOutputPath(path);
        }
      } catch (err) {
        console.error("Error checking file:", err);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [outputPath]);

  const handleSelectPath = async () => {
    const fmt = FORMAT_OPTIONS[formatIdx];
    const defaultName = getFileNameWithoutExtension(filePath);
    const selected = await save({
      filters: [{ name: "Video", extensions: [fmt.ext] }],
      defaultPath: outputPath || `${defaultName}_trimmed.${fmt.ext}`,
    });
    if (selected) {
      const dirMatch = selected.match(/^(.*?)[/\\][^/\\]+$/);
      selectedDirRef.current = dirMatch ? dirMatch[1] : "";
      setOutputPath(selected);
    }
  };

  const handleBlur = () => {
    if (!outputPath) return;
    const dirMatch = outputPath.match(/^(.*?)[/\\][^/\\]+$/);
    selectedDirRef.current = dirMatch ? dirMatch[1] : "";
    const fmt = FORMAT_OPTIONS[formatIdx];
    const ext = `.${fmt.ext}`;
    if (!outputPath.endsWith(ext)) {
      // Remove any existing extension and add correct one
      const withoutExt = outputPath.replace(/\.[^/.]+$/, '');
      setOutputPath(`${withoutExt}${ext}`);
    }
  };

  const resolutionOptions = useMemo(() => {
    if (!videoInfo) return [];
    return getResolutionOptions(videoInfo.width, videoInfo.height);
  }, [videoInfo]);

  const fpsOptions = useMemo(() => {
    if (!videoInfo) return [];
    return getFpsOptions(videoInfo.fps);
  }, [videoInfo]);

  const audioBitrateOptions = useMemo(() => {
    if (!videoInfo) return [];
    return getAudioBitrateOptions(videoInfo.audio_bitrate);
  }, [videoInfo]);

  const videoCodecOptions = useMemo(() => {
    if (!videoInfo) return [];
    return getVideoCodecOptions(videoInfo.codec);
  }, [videoInfo]);

  const trimDuration = trimRange.endTime - trimRange.startTime;
  const videoCodec = videoCodecOptions[videoCodecIdx];
  // Stream copy from a non-zero start can miss reference frames and show black leading frames.
  const shouldEncodeOriginalStart = !!videoInfo && ["H.264", "H.265"].includes(videoInfo.codec) && !videoCodec?.value && trimRange.startTime > 0;
  const shouldEncodeVideo = resolutionIdx !== 0 || fpsIdx !== 0 || !!videoCodec?.value || shouldEncodeOriginalStart;
  const shouldEncodeAudio = audioBitrateIdx !== 0 || !!videoInfo && !isAudioCopySafeForFormat(FORMAT_OPTIONS[formatIdx].value, videoInfo.audio_codec);
  const mode = shouldEncodeVideo ? "precise" : shouldEncodeAudio ? "audio" : "fast";

  useEffect(() => {
    if (!videoInfo || !resolutionOptions.length || !fpsOptions.length || !audioBitrateOptions.length || !videoCodecOptions.length) return;
    const res = resolutionOptions[resolutionIdx];
    const f = fpsOptions[fpsIdx];
    const audio = audioBitrateOptions[audioBitrateIdx];
    const videoCodec = videoCodecOptions[videoCodecIdx];
    if (!res || !f || !videoCodec) return;

    const originalAudioBitrate = videoInfo.audio_bitrate || 0;
    const selectedAudioBitrate = audio?.value ?? originalAudioBitrate;
    if (!shouldEncodeVideo) {
      setEstimatedBitrate(Math.max(getSourceTotalBitrate(videoInfo) - originalAudioBitrate, 0) + selectedAudioBitrate);
      return;
    }
    setEstimatedBitrate(estimateVideoBitrate(videoInfo, res.width, res.height, f.value, videoCodec.value || videoInfo.codec) + selectedAudioBitrate);
  }, [videoInfo, resolutionIdx, fpsIdx, audioBitrateIdx, videoCodecIdx, shouldEncodeVideo, resolutionOptions, fpsOptions, audioBitrateOptions, videoCodecOptions]);

  const estimatedSize = useMemo(() => {
    if (!videoInfo || !estimatedBitrate) return 0;
    return (estimatedBitrate * trimDuration) / 8;
  }, [videoInfo, estimatedBitrate, trimDuration]);

  const formatSize = (bytes: number) => {
    if (bytes <= 0) return "-";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  };

  const getUniquePath = async (path: string): Promise<string> => {
    let uniquePath = path;
    let counter = 2;
    while (await checkFileExists(uniquePath)) {
      const ext = path.split('.').pop();
      const base = path.substring(0, path.lastIndexOf('.'));
      const cleanBase = base.replace(/\(\d+\)$/, '');
      uniquePath = `${cleanBase}(${counter}).${ext}`;
      counter++;
    }
    return uniquePath;
  };

  const handleExport = async () => {
    if (!outputPath || exporting) return;

    const finalPath = await getUniquePath(outputPath);
    if (finalPath !== outputPath) {
      setOutputPath(finalPath);
    }

    setExporting(true);
    onExportStart();

    const res = resolutionOptions[resolutionIdx];
    const f = fpsOptions[fpsIdx];
    const audioBitrate = audioBitrateOptions[audioBitrateIdx];

    try {
      // Calculate scaled bitrate based on resolution ratio
      const bitrate = shouldEncodeVideo && videoInfo ? estimateVideoBitrate(videoInfo, res.width, res.height, f.value, videoCodec?.value || videoInfo.codec) : undefined;

      const result = await trimVideo(
        filePath,
        finalPath,
        trimRange.startTime,
        trimRange.endTime,
        mode,
        shouldEncodeVideo ? res.width : undefined,
        shouldEncodeVideo ? res.height : undefined,
        shouldEncodeVideo ? f.value : undefined,
        bitrate,
        shouldEncodeVideo ? videoCodec?.value || videoInfo?.codec || undefined : videoInfo?.codec || undefined,
        shouldEncodeVideo || shouldEncodeAudio ? audioBitrate?.value || videoInfo?.audio_bitrate || undefined : undefined
      );
      if (result.success) {
        onExportEnd("success");
      } else {
        onExportEnd("error", result.message || t("export.exportFailed"));
      }
    } catch (err) {
      console.error("Export error:", err);
      onExportEnd("error", String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <h2>{t("export.exportSettings")}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="modal-loading">{t("video.loadingVideoInfo")}</div>
          ) : error ? (
            <div className="modal-error">{error}</div>
          ) : videoInfo && (
            <>
              <div className="modal-section">
                <div className="modal-section-title">{t("export.exportPath")}</div>
                <div className="output-path-row">
                  <input
                    className="output-path-input"
                    type="text"
                    value={outputPath}
                    onChange={(e) => setOutputPath(e.target.value)}
                    onBlur={handleBlur}
                    placeholder={t("export.exportPath")}
                  />
                  <button className="btn-select-path" onClick={handleSelectPath}>{t("export.select")}</button>
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-section-title">{t("video.resolution")}</div>
                <div className="option-pills">
                  {resolutionOptions.map((opt, i) => (
                    <button
                      key={i}
                      className={`option-pill ${i === resolutionIdx ? "option-pill-active" : ""}`}
                      onClick={() => setResolutionIdx(i)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-section-title">{t("video.fps")}</div>
                <div className="option-pills">
                  {fpsOptions.map((opt, i) => (
                    <button
                      key={i}
                      className={`option-pill ${i === fpsIdx ? "option-pill-active" : ""}`}
                      onClick={() => setFpsIdx(i)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-section-title">{t("video.audioBitrate")}</div>
                <div className="option-pills">
                  {audioBitrateOptions.map((opt, i) => (
                    <button
                      key={i}
                      className={`option-pill ${i === audioBitrateIdx ? "option-pill-active" : ""}`}
                      onClick={() => setAudioBitrateIdx(i)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-section-title">{t("video.videoCodec")}</div>
                <div className="option-pills">
                  {videoCodecOptions.map((opt, i) => (
                    <button
                      key={i}
                      className={`option-pill ${i === videoCodecIdx ? "option-pill-active" : ""}`}
                      onClick={() => setVideoCodecIdx(i)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-section-title">{t("video.format")}</div>
                <div className="option-pills">
                  {FORMAT_OPTIONS.map((opt, i) => (
                    <button
                      key={i}
                      className={`option-pill ${i === formatIdx ? "option-pill-active" : ""}`}
                      onClick={() => setFormatIdx(i)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <div className="modal-footer-info">
            <span className="modal-footer-label">{t("export.estimatedSize")}</span>
            <span className="modal-footer-value">{formatSize(estimatedSize)}</span>
            <span className="modal-footer-sep">/</span>
            <span className="modal-footer-label">{t("editor.trimDuration")}</span>
            <span className="modal-footer-value">{formatDuration(trimDuration)}</span>
          </div>
          <div className="modal-footer-right">
            <button className="btn-export" onClick={handleExport} disabled={loading || exporting || !outputPath}>
              {exporting ? t("export.exporting") : t("export.export")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
