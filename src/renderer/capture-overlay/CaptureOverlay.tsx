import { useCallback, useEffect, useRef, useState } from "react";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Corner = "nw" | "ne" | "sw" | "se";
type Phase = "idle" | "dragging" | "selected";

const MIN_SELECTION_SIZE = 4;
const TOOLBAR_HEIGHT = 48;
const TOOLBAR_GAP = 12;
const HANDLE_SIZE = 9;

const CORNERS: { corner: Corner; cursor: string }[] = [
  { corner: "nw", cursor: "nwse-resize" },
  { corner: "ne", cursor: "nesw-resize" },
  { corner: "sw", cursor: "nesw-resize" },
  { corner: "se", cursor: "nwse-resize" },
];

function isTooSmall(rect: Rect): boolean {
  return rect.width < MIN_SELECTION_SIZE || rect.height < MIN_SELECTION_SIZE;
}

/** Режим оверлея — читается один раз из query-параметра окна ("record" открывает
 * WindowsScreenRecording, всё остальное — обычный скриншот-флоу по умолчанию). */
function readMode(): "screenshot" | "record" {
  return new URLSearchParams(window.location.search).get("mode") === "record" ? "record" : "screenshot";
}

export function CaptureOverlay() {
  const [mode] = useState(readMode);
  const [phase, setPhase] = useState<Phase>("idle");
  const [rect, setRect] = useState<Rect | null>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const resizeCorner = useRef<Corner | null>(null);
  const resizeOrigin = useRef<Rect | null>(null);
  const moveOrigin = useRef<{ mouseX: number; mouseY: number; rect: Rect } | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        window.captureOverlay.reportCancelled();
        return;
      }
      // Ctrl+C поверх готового выделения — сразу в буфер обмена, минуя окно выбора
      // действия (аналог кнопки "Копировать" в тулбаре, см. handleCopy). Неприменимо
      // в режиме записи — видео нельзя положить в буфер обмена обычным способом.
      if (
        mode === "screenshot" &&
        event.key.toLowerCase() === "c" &&
        event.ctrlKey &&
        phase === "selected" &&
        rect &&
        !isTooSmall(rect)
      ) {
        window.captureOverlay.reportRegionSelected({ ...rect, action: "clipboard" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, phase, rect]);

  const handleContainerMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (phase === "selected") return; // выделение уже подтверждается через тулбар/ручки
      dragOrigin.current = { x: event.clientX, y: event.clientY };
      setRect({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
      setPhase("dragging");
    },
    [phase],
  );

  const handleContainerMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (phase === "dragging" && dragOrigin.current) {
        const origin = dragOrigin.current;
        setRect({
          x: Math.min(origin.x, event.clientX),
          y: Math.min(origin.y, event.clientY),
          width: Math.abs(event.clientX - origin.x),
          height: Math.abs(event.clientY - origin.y),
        });
      } else if (phase === "selected" && resizeCorner.current && resizeOrigin.current) {
        const origin = resizeOrigin.current;
        const corner = resizeCorner.current;
        let { x, y, width, height } = origin;

        if (corner === "nw" || corner === "sw") {
          const right = origin.x + origin.width;
          x = Math.min(event.clientX, right - MIN_SELECTION_SIZE);
          width = right - x;
        } else {
          width = Math.max(MIN_SELECTION_SIZE, event.clientX - origin.x);
        }
        if (corner === "nw" || corner === "ne") {
          const bottom = origin.y + origin.height;
          y = Math.min(event.clientY, bottom - MIN_SELECTION_SIZE);
          height = bottom - y;
        } else {
          height = Math.max(MIN_SELECTION_SIZE, event.clientY - origin.y);
        }
        setRect({ x, y, width, height });
      } else if (phase === "selected" && moveOrigin.current) {
        const { mouseX, mouseY, rect: origin } = moveOrigin.current;
        const maxX = window.innerWidth - origin.width;
        const maxY = window.innerHeight - origin.height;
        setRect({
          x: Math.min(Math.max(0, origin.x + (event.clientX - mouseX)), Math.max(0, maxX)),
          y: Math.min(Math.max(0, origin.y + (event.clientY - mouseY)), Math.max(0, maxY)),
          width: origin.width,
          height: origin.height,
        });
      }
    },
    [phase],
  );

  const handleContainerMouseUp = useCallback(() => {
    if (phase === "dragging") {
      dragOrigin.current = null;
      if (!rect || isTooSmall(rect)) {
        setRect(null);
        setPhase("idle");
      } else {
        setPhase("selected");
      }
    } else if (resizeCorner.current) {
      resizeCorner.current = null;
      resizeOrigin.current = null;
    } else if (moveOrigin.current) {
      moveOrigin.current = null;
    }
  }, [phase, rect]);

  const startResize = useCallback(
    (corner: Corner) => (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!rect) return;
      resizeCorner.current = corner;
      resizeOrigin.current = rect;
    },
    [rect],
  );

  // Перетаскивание всей выделенной области целиком (как в Lightshot) — клик внутри
  // рамки, не на ручке изменения размера (те сами stopPropagation'ят).
  const startMove = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!rect) return;
      moveOrigin.current = { mouseX: event.clientX, mouseY: event.clientY, rect };
    },
    [rect],
  );

  const handleRedo = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setRect(null);
    setPhase("idle");
  }, []);

  const handleFullscreen = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setRect({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
    setPhase("selected");
  }, []);

  const handleDone = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!rect || isTooSmall(rect)) return;
      window.captureOverlay.reportRegionSelected({ ...rect, action: "choice" });
    },
    [rect],
  );

  // Иконка "Копировать" в тулбаре — тот же результат, что и Ctrl+C (см. handleKeyDown).
  const handleCopy = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!rect || isTooSmall(rect)) return;
      window.captureOverlay.reportRegionSelected({ ...rect, action: "clipboard" });
    },
    [rect],
  );

  const handleCancel = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    window.captureOverlay.reportCancelled();
  }, []);

  // Режим записи: подтверждение области сразу стартует запись (см. ScreenRecordingProvider) —
  // аналог handleDone, но с action:"record" вместо "choice".
  const handleStartRecording = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!rect || isTooSmall(rect)) return;
      window.captureOverlay.reportRegionSelected({ ...rect, action: "record" });
    },
    [rect],
  );

  const showDimensionLabel = rect && (phase === "dragging" || phase === "selected") && !isTooSmall(rect);

  let toolbarTop = 0;
  let toolbarLeft = 0;
  if (rect) {
    const belowFits = rect.y + rect.height + TOOLBAR_GAP + TOOLBAR_HEIGHT <= window.innerHeight;
    toolbarTop = belowFits ? rect.y + rect.height + TOOLBAR_GAP : rect.y - TOOLBAR_GAP - TOOLBAR_HEIGHT;
    toolbarLeft = rect.x + rect.width / 2;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        cursor: phase === "selected" ? "default" : "crosshair",
        background: rect ? "transparent" : "rgba(0, 0, 0, 0.25)",
      }}
      onMouseDown={handleContainerMouseDown}
      onMouseMove={handleContainerMouseMove}
      onMouseUp={handleContainerMouseUp}
    >
      {rect && !isTooSmall(rect) && (
        <div
          onMouseDown={phase === "selected" ? startMove : undefined}
          style={{
            position: "absolute",
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            boxSizing: "border-box",
            outline: "1.5px dashed var(--ks-accent)",
            boxShadow: "0 0 0 2000px rgba(0, 0, 0, 0.55)",
            cursor: phase === "selected" ? "move" : undefined,
          }}
        >
          {showDimensionLabel && (
            <div
              className="ks-chip-mono"
              style={{
                position: "absolute",
                top: rect.y > TOOLBAR_HEIGHT ? -32 : 8,
                left: 0,
                color: "var(--ks-text)",
              }}
            >
              {Math.round(rect.width)} × {Math.round(rect.height)}
            </div>
          )}

          {phase === "selected" &&
            CORNERS.map(({ corner, cursor }) => (
              <div
                key={corner}
                onMouseDown={startResize(corner)}
                style={{
                  position: "absolute",
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  borderRadius: 2,
                  background: "var(--ks-accent)",
                  cursor,
                  left: corner === "nw" || corner === "sw" ? -HANDLE_SIZE / 2 : undefined,
                  right: corner === "ne" || corner === "se" ? -HANDLE_SIZE / 2 : undefined,
                  top: corner === "nw" || corner === "ne" ? -HANDLE_SIZE / 2 : undefined,
                  bottom: corner === "sw" || corner === "se" ? -HANDLE_SIZE / 2 : undefined,
                }}
              />
            ))}
        </div>
      )}

      {phase === "selected" && rect && (
        <div
          style={{
            position: "absolute",
            left: toolbarLeft,
            top: toolbarTop,
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--ks-bg-chip)",
            border: "1px solid var(--ks-border-strong)",
            borderRadius: 12,
            padding: 6,
            boxShadow: "0 12px 24px -8px rgba(0,0,0,0.5)",
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <ToolbarButton title="Отмена" onClick={handleCancel}>
            ✕
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton title="Во весь экран" onClick={handleFullscreen}>
            ⛶
          </ToolbarButton>
          <ToolbarButton title="Заново" onClick={handleRedo}>
            ↺
          </ToolbarButton>
          {mode === "screenshot" && (
            <ToolbarButton title="Скопировать в буфер обмена (Ctrl+C)" onClick={handleCopy}>
              📋
            </ToolbarButton>
          )}
          <ToolbarDivider />
          {mode === "record" ? (
            <button
              type="button"
              onClick={handleStartRecording}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 8,
                border: "none",
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--ks-accent)",
                color: "var(--ks-accent-contrast)",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              ● Начать запись
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDone}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: 8,
                border: "none",
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--ks-accent)",
                color: "var(--ks-accent-contrast)",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              ✓ Готово
            </button>
          )}
        </div>
      )}

      {phase === "idle" && (
        <div
          className="ks-note"
          style={{
            position: "fixed",
            top: 24,
            left: "50%",
            transform: "translateX(-50%)",
            color: "var(--ks-text-secondary)",
          }}
        >
          {mode === "record" ? "Выделите область для записи" : "Выделите область экрана"} ·{" "}
          <span className="ks-chip-mono" style={{ padding: "1px 6px" }}>
            Esc
          </span>{" "}
          — отмена
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      title={title}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--ks-text-secondary)",
        cursor: "pointer",
      }}
    >
      {children}
    </div>
  );
}

function ToolbarDivider() {
  return <div style={{ width: 1, height: 20, background: "var(--ks-border-strong)" }} />;
}
