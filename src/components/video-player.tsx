import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TrimRange } from "../types/trim";

interface Props {
  filePath: string;
  trimRange: TrimRange;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onPlayStateChange: (playing: boolean) => void;
  onTogglePlay: () => void;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
}

export default function VideoPlayer({
  filePath,
  trimRange,
  onTimeUpdate,
  onDurationChange,
  onPlayStateChange,
  onTogglePlay,
  videoRef,
}: Props) {
  const [videoUrl, setVideoUrl] = useState("");
  const rafRef = useRef(0);
  const playingRef = useRef(false);
  const trimRef = useRef(trimRange);
  trimRef.current = trimRange;

  useEffect(() => {
    invoke<number>("get_video_port").then((port) => {
      const url = `http://127.0.0.1:${port}/video?path=${encodeURIComponent(filePath)}`;
      setVideoUrl(url);
    });
  }, [filePath]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    video.src = videoUrl;
    video.load();
    video.currentTime = 0;

    const onLoaded = () => {
      video.currentTime = 0;
      onDurationChange(video.duration);
      onTimeUpdate(0);
    };
    const onPlay = () => { playingRef.current = true; onPlayStateChange(true); onTimeUpdate(video.currentTime); };
    const onPause = () => { playingRef.current = false; onPlayStateChange(false); };
    const onEnded = () => { playingRef.current = false; onPlayStateChange(false); };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("loadeddata", () => { video.currentTime = 0; onTimeUpdate(0); });
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, [videoUrl, videoRef, onDurationChange, onPlayStateChange]);

  useEffect(() => {
    function tick() {
      const v = videoRef.current;
      if (v && playingRef.current) {
        const trim = trimRef.current;
        if (v.currentTime >= trim.endTime) {
          v.currentTime = trim.endTime;
          v.pause();
          onTimeUpdate(trim.endTime);
        } else {
          onTimeUpdate(v.currentTime);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoRef, onTimeUpdate]);

  return (
    <div className="editor-preview" onContextMenu={(e) => e.preventDefault()} onClick={onTogglePlay}>
      {videoUrl && <video ref={videoRef} playsInline disablePictureInPicture controlsList="nodownload nofullscreen noremoteplayback" />}
    </div>
  );
}
