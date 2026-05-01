import { useState, useEffect, useMemo } from "react";
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
  onExportEnd: (status: ExportStatus) => void;
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

const FORMAT_OPTIONS = [
  { label: "MP4", value: "mp4", ext: "mp4" },
  { label: "MOV", value: "mov", ext: "mov" },
];

function getResolutionOptions(origW: number, origH: number): ResolutionOption[] {
  const options: ResolutionOption[] = [{ label: `${t("original")} (${origW}×${origH})`, width: origW, height: origH }];
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
  const options: FpsOption[] = [{ label: `${t("original")} (${origFps} fps)`, value: origFps }];
  const presets = [60, 30, 25, 24];
  for (const f of presets) {
    if (f < origFps) {
      options.push({ label: `${f} fps`, value: f });
    }
  }
  return options;
}

export default function ExportModal({ filePath, trimRange, onClose, onExportStart, onExportEnd }: Props) {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolutionIdx, setResolutionIdx] = useState(0);
  const [fpsIdx, setFpsIdx] = useState(0);
  const [formatIdx, setFormatIdx] = useState(0);
  const [outputPath, setOutputPath] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [estimatedBitrate, setEstimatedBitrate] = useState<number>(0);

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
    const fmt = FORMAT_OPTIONS[formatIdx];
    const defaultName = getFileNameWithoutExtension(filePath);
    // Get directory path, handle both Windows and macOS paths
    const dirMatch = filePath.match(/^(.*?)[/\\][^/\\]+$/);
    const dir = dirMatch ? dirMatch[1] : '';
    const now = new Date();
    const ts = `${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    // Use the same path separator as the original path
    const separator = filePath.includes('\\') ? '\\' : '/';
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
      setOutputPath(selected);
    }
  };

  const handleBlur = () => {
    if (!outputPath) return;
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

  const trimDuration = trimRange.endTime - trimRange.startTime;

  useEffect(() => {
    if (!videoInfo || !resolutionOptions.length || !fpsOptions.length) return;
    const res = resolutionOptions[resolutionIdx];
    const f = fpsOptions[fpsIdx];
    if (!res || !f) return;

    // If original, use original bitrate
    if (resolutionIdx === 0 && fpsIdx === 0) {
      setEstimatedBitrate(videoInfo.bitrate);
      return;
    }

    // Calculate bitrate based on resolution and fps ratio
    const origPixels = videoInfo.width * videoInfo.height;
    const newPixels = res.width * res.height;
    const pixelScale = newPixels / origPixels;
    const fpsScale = f.value / videoInfo.fps;
    const estimated = Math.round(videoInfo.bitrate * pixelScale * fpsScale);
    setEstimatedBitrate(estimated);
  }, [videoInfo, resolutionIdx, fpsIdx, resolutionOptions, fpsOptions]);

  const isOriginal = resolutionIdx === 0 && fpsIdx === 0;
  const mode = isOriginal ? "fast" : "precise";

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
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (seconds < 1) return `0:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

    try {
      // Calculate scaled bitrate based on resolution ratio
      let bitrate: number | undefined;
      if (!isOriginal && videoInfo) {
        const origPixels = videoInfo.width * videoInfo.height;
        const newPixels = res.width * res.height;
        const scale = newPixels / origPixels;
        bitrate = Math.round(videoInfo.bitrate * scale);
      }

      const result = await trimVideo(
        filePath,
        finalPath,
        trimRange.startTime,
        trimRange.endTime,
        mode,
        isOriginal ? undefined : res.width,
        isOriginal ? undefined : res.height,
        isOriginal ? undefined : f.value,
        bitrate
      );
      onExportEnd(result.success ? "success" : "error");
    } catch (err) {
      console.error("Export error:", err);
      onExportEnd("error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <h2>{t("exportSettings")}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="modal-loading">{t("loadingVideoInfo")}</div>
          ) : error ? (
            <div className="modal-error">{error}</div>
          ) : videoInfo && (
            <>
              <div className="modal-section">
                <div className="modal-section-title">{t("exportPath")}</div>
                <div className="output-path-row">
                  <input
                    className="output-path-input"
                    type="text"
                    value={outputPath}
                    onChange={(e) => setOutputPath(e.target.value)}
                    onBlur={handleBlur}
                    placeholder={t("exportPath")}
                  />
                  <button className="btn-select-path" onClick={handleSelectPath}>{t("select")}</button>
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-section-title">{t("resolution")}</div>
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
                <div className="modal-section-title">{t("fps")}</div>
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
                <div className="modal-section-title">{t("format")}</div>
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
            <span className="modal-footer-label">{t("estimatedSize")}</span>
            <span className="modal-footer-value">{formatSize(estimatedSize)}</span>
            <span className="modal-footer-sep">/</span>
            <span className="modal-footer-label">{t("trimDuration")}</span>
            <span className="modal-footer-value">{formatDuration(trimDuration)}</span>
          </div>
          <div className="modal-footer-right">
            <button className="btn-export" onClick={handleExport} disabled={loading || exporting || !outputPath}>
              {exporting ? t("exporting") : t("export")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
