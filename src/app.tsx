import { useState, useCallback, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import VideoPlayer from "./components/video-player";
import Timeline from "./components/timeline";
import ExportModal from "./components/export-modal";
import { InfoModal } from "./components/info-modal";
import { formatTimeWithMs } from "./lib/time";
import { getLang, t } from "./lib/i18n";
import { getFileName } from "./lib/path";
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
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [videoKey, setVideoKey] = useState(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const filePathRef = useRef(filePath);

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

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
    if (event.detail > 1) return;
    void getCurrentWindow().startDragging().catch(() => {});
  }, []);

  const handleWindowControlPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleWindowMinimize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void getCurrentWindow().minimize().catch(() => {});
  }, []);

  const handleWindowMaximize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void getCurrentWindow().toggleMaximize().catch(() => {});
  }, []);

  const handleWindowClose = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void getCurrentWindow().close().catch(() => {});
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

  const handleInfoClick = useCallback(() => {
    if (!filePath) return;
    setShowInfoModal(true);
    setShowMenu(false);
  }, [filePath]);

  const handleExportStart = useCallback(() => {
    setExportStatus("exporting");
  }, []);

  const handleExportEnd = useCallback((status: ExportStatus, message?: string) => {
    setExportStatus(status);
    if (status === "success") {
      setToast({ message: t("export.exportSuccess"), type: "success" });
      setTimeout(() => setToast(null), 3000);
    }
    if (status === "error") {
      setToast({ message: message || t("export.exportFailed"), type: "error" });
      setTimeout(() => setToast(null), 5000);
    }
    if (status !== "idle") {
      setTimeout(() => setExportStatus("idle"), 3000);
    }
  }, []);

  const isMac = /macintosh|mac os x|mac_powerpc/i.test(navigator.userAgent);

  // Track window maximized state for Windows titlebar button icon
  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setIsMaximized).catch(() => {});
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setIsMaximized).catch(() => {});
    });
    return () => {
      unlisten.then(fn => fn()).catch(() => {});
    };
  }, []);

  const renderShortcut = (text: string) => (
    <span className="more-menu-item-shortcut">
      {text.split('+').map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="shortcut-sep">+</span>}
          <span className={part === '⌘' ? 'shortcut-key shortcut-key-cmd' : 'shortcut-key'}>{part}</span>
        </span>
      ))}
    </span>
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // ESC: Close modals
      if (e.key === 'Escape') {
        if (showExportModal && exportStatus !== "exporting") {
          setShowExportModal(false);
          return;
        }
        if (showInfoModal) {
          setShowInfoModal(false);
          return;
        }
        if (showMenu) {
          setShowMenu(false);
          return;
        }
      }

      // Space: Toggle play
      if (e.code === "Space" && filePath) {
        e.preventDefault();
        togglePlay();
        return;
      }

      // Left/Right arrow: Seek
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        const video = videoRef.current;
        if (!video || !filePath) return;

        const step = e.shiftKey ? 0.01 : 1;
        const direction = e.code === "ArrowLeft" ? -1 : 1;
        const newTime = Math.max(trimRange.startTime, Math.min(trimRange.endTime, currentTime + direction * step));

        if (!video.paused) video.pause();
        video.currentTime = newTime;
        setCurrentTime(newTime);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filePath, togglePlay, currentTime, trimRange, showExportModal, showInfoModal, showMenu, exportStatus]);

  useEffect(() => {
    void invoke("set_menu_state", {
      lang: getLang(),
      hasVideo: Boolean(filePath),
    }).catch(() => {});
  }, [filePath]);

  useEffect(() => {
    let unlistenMenu: (() => void) | undefined;

    void listen<string>("file-menu-action", (event) => {
      if (event.payload === "new-project") {
        void handleNewProject();
        return;
      }
      if (event.payload === "info") {
        handleInfoClick();
        return;
      }
      if (event.payload === "export-video" && filePath && exportStatus !== "exporting") {
        handleExportClick();
      }
    }).then((unlisten) => {
      unlistenMenu = unlisten;
    });

    return () => {
      unlistenMenu?.();
    };
  }, [filePath, exportStatus, handleNewProject, handleInfoClick, handleExportClick]);

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
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") {
        setDragOver(true);
      } else if (event.payload.type === "drop") {
        setDragOver(false);
        const paths = event.payload.paths;
        if (paths.length > 0) {
          const path = paths[0];
          const ext = path.split(".").pop()?.toLowerCase();
          if (["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "3gp"].includes(ext!)) {
            loadFile(path);
          }
        }
      } else if (event.payload.type === "leave") {
        setDragOver(false);
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  async function handleOpenVideo() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Video", extensions: ["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "3gp"] }],
    });
    if (selected) {
      loadFile(selected as string);
    }
  }

  function loadFile(path: string) {
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }
    setFilePath(path);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setTrimRange({ startTime: 0, endTime: 0 });
    setShowMenu(false);
    setShowExportModal(false);
    setShowInfoModal(false);
    setExportStatus("idle");
    setToast(null);
    setDragOver(false);
    setVideoKey(prev => prev + 1);
  }

  const trimDuration = trimRange.endTime - trimRange.startTime;
  const fileName = getFileName(filePath);
  const titlebar = (
    <div className={`app-titlebar ${isMac ? "app-titlebar-macos" : "app-titlebar-windows"}`}>
      <div
        className="app-titlebar-drag"
        data-tauri-drag-region
        onMouseDown={handleWindowDrag}
      >
        {fileName && <span className="app-titlebar-filename">{fileName}</span>}
      </div>
      {!isMac && (
        <div className="window-controls">
          <button
            type="button"
            className="window-control"
            onPointerDown={handleWindowControlPointerDown}
            onPointerUp={handleWindowMinimize}
            title="Minimize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <rect x="1" y="5" width="8" height="1" />
            </svg>
          </button>
          <button
            type="button"
            className="window-control"
            onPointerDown={handleWindowControlPointerDown}
            onPointerUp={handleWindowMaximize}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="1" y="3" width="5" height="5" />
                <rect x="3" y="1" width="5" height="5" fill="#000" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="2" y="2" width="6" height="6" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="window-control window-control-close"
            onPointerDown={handleWindowControlPointerDown}
            onPointerUp={handleWindowClose}
            title="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <line x1="2" y1="2" x2="8" y2="8" />
              <line x1="8" y1="2" x2="2" y2="8" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );

  if (!filePath) {
    return (
      <div className="open-screen">
        {titlebar}
        <div className="open-content">
          <div
            className={`open-dropzone ${dragOver ? "open-dropzone-hover" : ""}`}
            onClick={handleOpenVideo}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="open-dropzone-text">{t("app.dropVideo")}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      {titlebar}

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
          <span className="time-label-duration">{formatTimeWithMs(Math.max(0, currentTime - trimRange.startTime))} / {formatTimeWithMs(trimDuration)}</span>
          <span className="time-label-hint">{t("editor.shiftHint")}</span>
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
            <button className="btn-more" onClick={handleMenuToggle} title={t("app.more")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="6" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="18" r="2" />
              </svg>
            </button>
            {showMenu && (
              <div className="more-menu">
                <button className="more-menu-item" onClick={handleNewProject}>
                  <div className="more-menu-item-left">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>{t("menu.newProject")}</span>
                  </div>
                  {renderShortcut(isMac ? '⌘+N' : 'CTRL+N')}
                </button>
                <button className="more-menu-item" onClick={handleInfoClick}>
                  <div className="more-menu-item-left">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span>{t("menu.info")}</span>
                  </div>
                  {renderShortcut(isMac ? '⌘+I' : 'CTRL+I')}
                </button>
                <button className="more-menu-item" onClick={handleExportClick} disabled={exportStatus === "exporting"}>
                  <div className="more-menu-item-left">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>{exportStatus === "exporting" ? t("export.exporting") : t("menu.exportVideo")}</span>
                  </div>
                  {renderShortcut(isMac ? '⌘+E' : 'CTRL+E')}
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
          onExportEnd={(status, message) => {
            if (filePathRef.current === filePath) {
              handleExportEnd(status, message);
            }
          }}
        />
      )}

      {showInfoModal && (
        <InfoModal
          filePath={filePath}
          onClose={() => setShowInfoModal(false)}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === "success" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
