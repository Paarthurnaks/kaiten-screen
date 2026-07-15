import { useEffect, useReducer, useRef, useState } from "react";
import type { PendingCaptureDto } from "../../shared/ipc-contract";
import { AnnotationCanvas, type AnnotationCanvasHandle } from "../shared/AnnotationCanvas";
import { AnnotationToolbar } from "./AnnotationToolbar";
import {
  ANNOTATION_COLORS,
  annotationsReducer,
  EMPTY_ANNOTATIONS_STATE,
  type AnnotationShape,
} from "../shared/annotation-shapes";

const LOG_PREFIX = "Annotation";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Экран аннотирования скриншота — отдельное окно между захватом области и
 * выбором действия (см. design/Screenshotter for Kaiten.dc.html, экран
 * "02 — Аннотирование"). Main открывает это окно только для скриншотов
 * (см. main/index.ts triggerCaptureFlow) — video-флоу сюда не попадает. */
export function Annotation() {
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingCaptureDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [annotations, dispatchAnnotation] = useReducer(annotationsReducer, EMPTY_ANNOTATIONS_STATE);
  const [activeTool, setActiveTool] = useState<"arrow" | "rect" | null>(null);
  const [activeColor, setActiveColor] = useState<string>(ANNOTATION_COLORS[0]);
  const annotationCanvasRef = useRef<AnnotationCanvasHandle>(null);

  useEffect(() => {
    let cancelled = false;
    window.kaitenScreen
      .getPendingCapture()
      .then((result) => {
        if (cancelled) return;
        if (result?.kind === "video") {
          // Main открывает это окно только для скриншотов (triggerCaptureFlow) —
          // video-флоу сюда попасть не должен. Рассинхронизация протокола, не
          // ожидаемый путь выполнения: не рендерим UI аннотирования, уходим
          // сразу на экран выбора действия, где video-превью уже поддержано.
          console.warn(LOG_PREFIX, "unexpected video pending capture — routing back to post-capture-choice");
          void window.kaitenScreen.backToChoice();
          return;
        }
        console.debug(LOG_PREFIX, "pending capture loaded", { kind: result?.kind ?? null });
        setPending(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Ctrl+Z — отменить последнюю нарисованную фигуру (аналог кнопки "Отменить" в
  // тулбаре), по образцу обработки Escape в CaptureOverlay.tsx.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (annotations.history.length === 0) return;
      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        console.debug(LOG_PREFIX, "Ctrl+Z pressed — undo");
        dispatchAnnotation({ type: "undo" });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotations.history.length]);

  async function handleDone(): Promise<void> {
    setBusy(true);
    if (annotations.shapes.length > 0) {
      const dataUrl = annotationCanvasRef.current?.toDataURL();
      if (dataUrl) {
        console.debug(LOG_PREFIX, "sending annotated image to main", { shapeCount: annotations.shapes.length });
        await window.kaitenScreen.updatePendingImage(dataUrl);
      } else {
        console.warn(LOG_PREFIX, "annotation canvas not ready — cannot export annotated image");
      }
    } else {
      console.debug(LOG_PREFIX, "no annotations drawn — skipping updatePendingImage");
    }
    await window.kaitenScreen.backToChoice();
  }

  async function handleCancel(): Promise<void> {
    console.debug(LOG_PREFIX, "discarding annotations");
    setBusy(true);
    await window.kaitenScreen.backToChoice();
  }

  return (
    <div className="ks-card">
      <div className="ks-card-header">
        <AnnotationToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          activeColor={activeColor}
          onColorChange={setActiveColor}
          canUndo={annotations.history.length > 0}
          onUndo={() => dispatchAnnotation({ type: "undo" })}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="ks-btn ks-btn-secondary" disabled={busy} onClick={() => void handleCancel()}>
            Отмена
          </button>
          <button
            type="button"
            className="ks-btn ks-btn-primary"
            disabled={busy || loading || !pending}
            onClick={() => void handleDone()}
          >
            ✓ Готово
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background: "var(--ks-bg-subtle)",
        }}
      >
        {loading && <p className="ks-muted-text">Загрузка…</p>}
        {loadError && <p className="ks-error-text">Не удалось загрузить скриншот: {loadError}</p>}
        {pending && pending.kind === "image" && (
          <AnnotationCanvas
            ref={annotationCanvasRef}
            imageDataUrl={pending.imageDataUrl}
            shapes={annotations.shapes}
            activeTool={activeTool}
            activeColor={activeColor}
            onShapeCommitted={(shape: AnnotationShape) => dispatchAnnotation({ type: "add", shape })}
          />
        )}
      </div>
    </div>
  );
}
