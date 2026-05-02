import { useRef, useCallback, useMemo, useState } from "react";
import type { TrimRange } from "../types/trim";

const BAR_COUNT = 80;

interface Props {
  duration: number;
  trimRange: TrimRange;
  onRangeChange: (range: TrimRange) => void;
  currentTime: number;
  onSeek: (time: number) => void;
  onPlayheadDragStart: () => void;
}

export default function Timeline({
  duration,
  trimRange,
  onRangeChange,
  currentTime,
  onSeek,
  onPlayheadDragStart,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<null | "left" | "right">(null);
  const [tooltipTime, setTooltipTime] = useState(0);
  const [tooltipPct, setTooltipPct] = useState(0);

  const bars = useMemo(() => {
    return Array.from({ length: BAR_COUNT }, () => 0.3 + Math.random() * 0.4);
  }, []);

  const getTimeFromX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el || duration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  const leftPct = (trimRange.startTime / duration) * 100;
  const rightPct = (trimRange.endTime / duration) * 100;
  const playheadPct = (currentTime / duration) * 100;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const target = (e.target as HTMLElement).closest("[data-handle]") as HTMLElement | null;
      const which = target?.dataset.handle;

      if (which === "left") {
        setDragging("left");
        setTooltipTime(trimRange.startTime);
        setTooltipPct(leftPct);

        let startX = e.clientX;
        let startTime = trimRange.startTime;
        let prevShift = e.shiftKey;
        let finalTime = startTime;
        const onMove = (ev: MouseEvent) => {
          if (ev.shiftKey && !prevShift) {
            startX = ev.clientX;
            startTime = finalTime;
          }
          prevShift = ev.shiftKey;
          if (ev.shiftKey) {
            const dx = ev.clientX - startX;
            finalTime = Math.max(0, Math.min(startTime + dx * 0.01, trimRange.endTime - 0.05));
          } else {
            const t = getTimeFromX(ev.clientX);
            finalTime = Math.max(0, Math.min(t, trimRange.endTime - 0.05));
          }
          onRangeChange({ startTime: finalTime, endTime: trimRange.endTime });
          onSeek(finalTime);
          setTooltipTime(finalTime);
          setTooltipPct((finalTime / duration) * 100);
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          setDragging(null);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return;
      }

      if (which === "right") {
        setDragging("right");
        setTooltipTime(trimRange.endTime);
        setTooltipPct(rightPct);

        let startX = e.clientX;
        let startTime = trimRange.endTime;
        let prevShift = e.shiftKey;
        let finalTime = startTime;
        const onMove = (ev: MouseEvent) => {
          if (ev.shiftKey && !prevShift) {
            startX = ev.clientX;
            startTime = finalTime;
          }
          prevShift = ev.shiftKey;
          if (ev.shiftKey) {
            const dx = ev.clientX - startX;
            finalTime = Math.min(duration, Math.max(startTime + dx * 0.01, trimRange.startTime + 0.05));
          } else {
            const t = getTimeFromX(ev.clientX);
            finalTime = Math.min(duration, Math.max(t, trimRange.startTime + 0.05));
          }
          onRangeChange({ startTime: trimRange.startTime, endTime: finalTime });
          onSeek(finalTime);
          setTooltipTime(finalTime);
          setTooltipPct((finalTime / duration) * 100);
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
          setDragging(null);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return;
      }

      const getClampMargin = () => {
        const rect = trackRef.current?.getBoundingClientRect();
        return rect && rect.width > 0 ? (2 / rect.width) * duration : 0;
      };

      if (which === "playhead") {
        onPlayheadDragStart();
        const m = getClampMargin();
        const clamp = (t: number) => Math.max(trimRange.startTime + m, Math.min(trimRange.endTime - m, t));

        let startX = e.clientX;
        let startTime = clamp(getTimeFromX(e.clientX));
        let prevShift = e.shiftKey;
        onSeek(startTime);

        const onMove = (ev: MouseEvent) => {
          if (ev.shiftKey && !prevShift) {
            startX = ev.clientX;
            startTime = clamp(getTimeFromX(ev.clientX));
          }
          prevShift = ev.shiftKey;
          if (ev.shiftKey) {
            const dx = ev.clientX - startX;
            onSeek(clamp(startTime + dx * 0.01));
          } else {
            onSeek(clamp(getTimeFromX(ev.clientX)));
          }
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return;
      }

      // Click on track — seek within trim range
      const m = getClampMargin();
      const clamp = (t: number) => Math.max(trimRange.startTime + m, Math.min(trimRange.endTime - m, t));
      onSeek(clamp(getTimeFromX(e.clientX)));
      const onMove = (ev: MouseEvent) => onSeek(clamp(getTimeFromX(ev.clientX)));
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [getTimeFromX, trimRange, duration, onRangeChange, onSeek, onPlayheadDragStart, leftPct, rightPct]
  );

  if (duration <= 0) return null;

  return (
    <div className="trimmer-wrapper">
      <div className="trimmer" ref={trackRef} onMouseDown={handleMouseDown}>
        <div className="trimmer-filmstrip">
          {bars.map((h, i) => (
            <div key={i} className="trimmer-bar" style={{ opacity: h }} />
          ))}
        </div>

        <div className="trimmer-overlay-left" style={{ width: `${leftPct}%` }} />
        <div className="trimmer-overlay-right" style={{ width: `${100 - rightPct}%` }} />

        <div
          className="trimmer-selection"
          style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
        />

        <div
          className="trimmer-handle trimmer-handle-left"
          data-handle="left"
          style={{ left: `${leftPct}%` }}
        />

        <div
          className="trimmer-handle trimmer-handle-right"
          data-handle="right"
          style={{ left: `${rightPct}%` }}
        />

        {dragging && (
          <div className="trimmer-tooltip" style={{ left: `${tooltipPct}%` }}>
            {formatTimeMs(tooltipTime)}
          </div>
        )}

        <div
          className="trimmer-playhead"
          data-handle="playhead"
          style={{ left: `${playheadPct}%` }}
        />
      </div>
    </div>
  );
}

function formatTimeMs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${pad(m)}:${pad(s)}.${pad(ms)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
