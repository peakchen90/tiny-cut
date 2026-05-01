import { useState, useCallback, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import VideoPlayer from "./components/video-player";
import Timeline from "./components/timeline";
import ExportModal from "./components/export-modal";
import { formatTimeShort } from "./lib/time";
import { t } from "./lib/i18n";
import type { TrimRange, ExportStatus } from "./types/trim";

export default function App() {
  const [filePath, setFilePath] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trimRange, setTrimRange] = useState<TrimRange>({ startTime: 0, endTime: 0 });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [toast, setToast] = useState<string | null>(null);
  const [videoKey, setVideoKey] = useState(0);

  const handleDurationChange = useCallback((dur: number) => {
    setDuration(dur);
    setTrimRange({ startTime: 0, endTime: dur });
  }, []);

  const handleSeek = useCallback((time: number) => {
    const video = videoRef.current;
    if (video) {
      if (!video.paused) video.pause();
      video.currentTime = time;
    }
    setCurrentTime(time);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      const atEnd = video.currentTime >= trimRange.endTime - 0.1;
      const beforeStart = video.currentTime < trimRange.startTime;
      if (atEnd || beforeStart) {
        video.currentTime = trimRange.startTime;
        setCurrentTime(trimRange.startTime);
      }
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [trimRange]);

  const handlePlayheadDragStart = useCallback(() => {
    const video = videoRef.current;
    if (video && !video.paused) {
      video.pause();
    }
  }, []);

  const handleWindowDrag = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    void getCurrentWindow().startDragging().catch(() => {});
  }, []);

  const handleMenuToggle = useCallback(() => {
    setShowMenu(prev => !prev);
  }, []);

  const handleNewProject = useCallback(async () => {
    setShowMenu(false);
    await handleOpenVideo();
  }, []);

  const handleExportClick = useCallback(() => {
    setShowMenu(false);
    setShowExportModal(true);
    const video = videoRef.current;
    if (video && !video.paused) {
      video.pause();
    }
  }, []);

  const handleExportStart = useCallback(() => {
    setExportStatus("exporting");
  }, []);

  const handleExportEnd = useCallback((status: ExportStatus) => {
    setExportStatus(status);
    if (status === "success") {
      setToast(t("exportSuccess"));
      setTimeout(() => setToast(null), 3000);
    }
    if (status !== "idle") {
      setTimeout(() => setExportStatus("idle"), 3000);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && filePath) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filePath, togglePlay]);

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('.more-menu') && !target.closest('.btn-more')) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (filePath) return;
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") {
        setDragOver(true);
      } else if (event.payload.type === "drop") {
        setDragOver(false);
        const paths = event.payload.paths;
        if (paths.length > 0) {
          const path = paths[0];
          const ext = path.split(".").pop()?.toLowerCase();
          if (ext === "mp4" || ext === "mov") {
            loadFile(path);
          }
        }
      } else if (event.payload.type === "leave") {
        setDragOver(false);
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [filePath]);

  async function handleOpenVideo() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Video", extensions: ["mp4", "mov"] }],
    });
    if (selected) {
      loadFile(selected as string);
    }
  }

  function loadFile(path: string) {
    setFilePath(path);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setTrimRange({ startTime: 0, endTime: 0 });
    setVideoKey(prev => prev + 1);
  }

  const trimDuration = trimRange.endTime - trimRange.startTime;

  if (!filePath) {
    return (
      <div className="open-screen">
        <div className="app-titlebar" onMouseDown={handleWindowDrag} />
        <div
          className={`open-dropzone ${dragOver ? "open-dropzone-hover" : ""}`}
          onClick={handleOpenVideo}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className="open-dropzone-text">{t("dropVideo")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      <div className="app-titlebar" onMouseDown={handleWindowDrag} />

      <VideoPlayer
        key={videoKey}
        filePath={filePath}
        trimRange={trimRange}
        onTimeUpdate={setCurrentTime}
        onDurationChange={handleDurationChange}
        onPlayStateChange={setIsPlaying}
        videoRef={videoRef}
      />

      <div className="editor-bottom">
        <div className="time-labels">
          <div className="time-label">
            <span className="time-label-tag">{t("start")}</span>
            <span className="time-label-value">{formatTimeShort(trimRange.startTime)}</span>
          </div>
          <span className="time-label-duration">{formatTimeShort(Math.max(0, currentTime - trimRange.startTime))} / {formatTimeShort(trimDuration)}</span>
          <div className="time-label">
            <span className="time-label-tag">{t("end")}</span>
            <span className="time-label-value">{formatTimeShort(trimRange.endTime)}</span>
          </div>
        </div>

        <div className="timeline-row">
          <button className="btn-play" onClick={togglePlay}>
            {isPlaying ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,3 20,12 6,21" />
              </svg>
            )}
          </button>

          <Timeline
            duration={duration}
            trimRange={trimRange}
            onRangeChange={setTrimRange}
            currentTime={currentTime}
            onSeek={handleSeek}
            onPlayheadDragStart={handlePlayheadDragStart}
          />

          <div className="more-container">
            <button className="btn-more" onClick={handleMenuToggle} title={t("more")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="6" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="18" r="2" />
              </svg>
            </button>
            {showMenu && (
              <div className="more-menu">
                <button className="more-menu-item" onClick={handleNewProject}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {t("newProject")}
                </button>
                <button className="more-menu-item" onClick={handleExportClick} disabled={exportStatus === "exporting"}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {exportStatus === "exporting" ? t("exporting") : t("exportVideo")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showExportModal && (
        <ExportModal
          filePath={filePath}
          trimRange={trimRange}
          onClose={() => setShowExportModal(false)}
          onExportStart={handleExportStart}
          onExportEnd={handleExportEnd}
        />
      )}

      {toast && (
        <div className="toast">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {toast}
        </div>
      )}
    </div>
  );
}
