import { useState, useEffect } from "react";
import { getVideoInfo } from "../lib/tauri";
import { formatTimeShort } from "../lib/time";
import { t } from "../lib/i18n";
import { getFileName } from "../lib/path";
import type { VideoInfo } from "../types/trim";

interface Props {
  filePath: string;
  onClose: () => void;
}

export function InfoModal({ filePath, onClose }: Props) {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const formatFileSize = (bytes: number) => {
    if (bytes <= 0) return "-";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatBitrate = (bps: number) => {
    if (bps <= 0) return "-";
    if (bps < 1000) return `${bps} bps`;
    if (bps < 1000000) return `${(bps / 1000).toFixed(0)} kbps`;
    return `${(bps / 1000000).toFixed(1)} Mbps`;
  };

  const formatSampleRate = (hz: number) => {
    if (hz <= 0) return "-";
    if (hz < 1000) return `${hz} Hz`;
    return `${(hz / 1000).toFixed(1)} kHz`;
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-narrow">
        <div className="modal-header">
          <h2>{t("video.videoInfo")}</h2>
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
            <div className="info-table">
              <div className="info-row">
                <span className="info-label">{t("video.fileName")}</span>
                <span className="info-value">{getFileName(videoInfo.file_path)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t("video.fileSize")}</span>
                <span className="info-value">{formatFileSize(videoInfo.file_size)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t("video.duration")}</span>
                <span className="info-value">{formatTimeShort(videoInfo.duration)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t("video.resolution")}</span>
                <span className="info-value">{videoInfo.width}×{videoInfo.height}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t("video.fps")}</span>
                <span className="info-value">{videoInfo.fps.toFixed(2)} fps</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t("video.videoCodec")}</span>
                <span className="info-value">{videoInfo.codec || "-"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t("video.colorSpace")}</span>
                <span className="info-value">{videoInfo.color_space || "-"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t("video.bitrate")}</span>
                <span className="info-value">{formatBitrate(videoInfo.bitrate)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t("video.audioCodec")}</span>
                <span className="info-value">{videoInfo.audio_codec || "-"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t("video.audioSampleRate")}</span>
                <span className="info-value">{formatSampleRate(videoInfo.audio_sample_rate)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t("video.audioChannels")}</span>
                <span className="info-value">{videoInfo.audio_channels > 0 ? videoInfo.audio_channels : "-"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t("video.audioBitrate")}</span>
                <span className="info-value">{formatBitrate(videoInfo.audio_bitrate)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
