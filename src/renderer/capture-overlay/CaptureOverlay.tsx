import { useCallback, useEffect, useRef, useState } from "react";

interface Point {
  x: number;
  y: number;
}

const MIN_SELECTION_SIZE = 4;

export function CaptureOverlay() {
  const [start, setStart] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        window.captureOverlay.reportCancelled();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    isDragging.current = true;
    setStart({ x: event.clientX, y: event.clientY });
    setCurrent({ x: event.clientX, y: event.clientY });
  }, []);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!isDragging.current) return;
    setCurrent({ x: event.clientX, y: event.clientY });
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current || !start || !current) return;
    isDragging.current = false;

    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);

    if (width < MIN_SELECTION_SIZE || height < MIN_SELECTION_SIZE) {
      // Слишком маленькое выделение — считаем случайным кликом, ждём новой попытки.
      setStart(null);
      setCurrent(null);
      return;
    }

    window.captureOverlay.reportRegionSelected({ x, y, width, height });
  }, [start, current]);

  const rect =
    start && current
      ? {
          left: Math.min(start.x, current.x),
          top: Math.min(start.y, current.y),
          width: Math.abs(current.x - start.x),
          height: Math.abs(current.y - start.y),
        }
      : null;

  return (
    <div
      style={{ position: "fixed", inset: 0, cursor: "crosshair", background: "rgba(0, 0, 0, 0.25)" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {rect && (
        <div
          style={{
            position: "absolute",
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            border: "2px solid #2b6cb3",
            background: "rgba(43, 108, 179, 0.15)",
            boxSizing: "border-box",
          }}
        />
      )}
      <div
        style={{
          position: "fixed",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          color: "#fff",
          fontFamily: "sans-serif",
          fontSize: 13,
          background: "rgba(0, 0, 0, 0.5)",
          padding: "4px 10px",
          borderRadius: 4,
        }}
      >
        Выделите область — Esc для отмены
      </div>
    </div>
  );
}
