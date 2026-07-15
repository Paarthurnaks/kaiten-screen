import { useEffect, useReducer, useRef, useState } from "react";
import type { PendingCaptureDto } from "../../shared/ipc-contract";
import { fixWebmDuration } from "../shared/fix-webm-duration";
import { usePendingVideoUrl } from "../shared/use-pending-video-url";
import { AnnotationCanvas, type AnnotationCanvasHandle } from "../shared/AnnotationCanvas";
import { AnnotationToolbar } from "./AnnotationToolbar";
import {
  ANNOTATION_COLORS,
  annotationsReducer,
  EMPTY_ANNOTATIONS_STATE,
  type AnnotationShape,
} from "../shared/annotation-shapes";

const LOG_PREFIX = "PostCaptureChoice";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function PostCaptureChoice() {
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingCaptureDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const videoUrl = usePendingVideoUrl(pending);
  const [annotations, dispatchAnnotation] = useReducer(annotationsReducer, EMPTY_ANNOTATIONS_STATE);
  const [activeTool, setActiveTool] = useState<"arrow" | "rect" | null>(null);
  const [activeColor, setActiveColor] = useState<string>(ANNOTATION_COLORS[0]);
  const annotationCanvasRef = useRef<AnnotationCanvasHandle>(null);

  useEffect(() => {
    let cancelled = false;
    window.kaitenScreen
      .getPendingCapture()
      .then((result) => {
        if (!cancelled) setPending(result);
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
      if (pending?.kind !== "image" || annotations.history.length === 0) return;
      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        console.debug(LOG_PREFIX, "Ctrl+Z pressed — undo");
        dispatchAnnotation({ type: "undo" });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pending, annotations.history.length]);

  // Если пользователь что-то нарисовал поверх превью — отправляем отредактированную
  // картинку в main ДО вызова действия, чтобы submitTask/attachToExistingCard/
  // copyToClipboard (которые читают pendingCapture заново на main-стороне) увидели
  // уже аннотированное изображение. Если фигур нет — лишний IPC-роundtrip не нужен.
  async function exportAnnotatedImageIfNeeded(): Promise<void> {
    if (annotations.shapes.length === 0) {
      console.debug(LOG_PREFIX, "no annotations drawn — skipping updatePendingImage");
      return;
    }
    const dataUrl = annotationCanvasRef.current?.toDataURL();
    if (!dataUrl) {
      console.warn(LOG_PREFIX, "annotation canvas not ready — cannot export annotated image");
      return;
    }
    console.debug(LOG_PREFIX, "sending annotated image to main", { shapeCount: annotations.shapes.length });
    await window.kaitenScreen.updatePendingImage(dataUrl);
  }

  async function handleCreateTask(): Promise<void> {
    setBusy(true);
    await exportAnnotatedImageIfNeeded();
    await window.kaitenScreen.chooseCreateTask();
  }

  async function handleAttachExisting(): Promise<void> {
    setBusy(true);
    await exportAnnotatedImageIfNeeded();
    await window.kaitenScreen.chooseAttachExisting();
  }

  async function handleCopyToClipboard(): Promise<void> {
    setBusy(true);
    await exportAnnotatedImageIfNeeded();
    await window.kaitenScreen.copyToClipboard();
  }

  async function handleSaveToFile(): Promise<void> {
    setBusy(true);
    const result = await window.kaitenScreen.saveRecordingToFile();
    if (!result.path) {
      // Пользователь отменил диалог "Сохранить как…" — в отличие от
      // copyToClipboard, окно в этом случае не закрывается (см. ipc-handlers.ts),
      // так что возвращаем интерактивность, а не оставляем UI навсегда "занятым".
      setBusy(false);
    }
  }

  async function handleCancel(): Promise<void> {
    setBusy(true);
    await window.kaitenScreen.cancelPendingCapture();
  }

  return (
    <div className="ks-card">
      <div className="ks-card-body" style={{ paddingTop: 20 }}>
        {loading && <p className="ks-muted-text">Загрузка…</p>}
        {loadError && <p className="ks-error-text">Не удалось загрузить скриншот: {loadError}</p>}

        {pending && pending.kind === "image" && (
          <AnnotationToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            activeColor={activeColor}
            onColorChange={setActiveColor}
            canUndo={annotations.history.length > 0}
            canClear={annotations.shapes.length > 0}
            onUndo={() => dispatchAnnotation({ type: "undo" })}
            onClear={() => dispatchAnnotation({ type: "clear" })}
          />
        )}

        {pending && (
          <div
            style={{
              borderRadius: 10,
              overflow: "hidden",
              border: "1px solid var(--ks-border)",
              background: "var(--ks-bg-subtle)",
            }}
          >
            {pending.kind === "video" ? (
              videoUrl && (
                <video
                  src={videoUrl}
                  controls
                  onLoadedMetadata={(event) => fixWebmDuration(event.currentTarget)}
                  style={{ display: "block", width: "100%" }}
                />
              )
            ) : (
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
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="ks-card-title">{pending?.kind === "video" ? "Запись готова" : "Скриншот готов"}</div>
          {pending && (
            <div className="ks-chip-mono">
              {pending.region.width}×{pending.region.height}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <ActionButton
            icon="＋"
            title="Создать новую задачу"
            subtitle="Заполнить карточку с нуля"
            primary
            disabled={busy || loading}
            onClick={() => void handleCreateTask()}
          />
          <ActionButton
            icon="📎"
            title="Прикрепить к существующей"
            subtitle="Найти задачу по ID или названию"
            disabled={busy || loading}
            onClick={() => void handleAttachExisting()}
          />
          {pending?.kind === "video" ? (
            <ActionButton
              icon="💾"
              title="Сохранить в файл"
              subtitle="Сохранить .webm на диск, без создания карточки"
              disabled={busy || loading}
              onClick={() => void handleSaveToFile()}
            />
          ) : (
            <ActionButton
              icon="📋"
              title="Скопировать в буфер обмена"
              subtitle="Без создания карточки в Kaiten"
              disabled={busy || loading}
              onClick={() => void handleCopyToClipboard()}
            />
          )}
          <button
            type="button"
            className="ks-btn ks-btn-ghost"
            disabled={busy}
            onClick={() => void handleCancel()}
            style={{ textAlign: "center" }}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  title,
  subtitle,
  primary,
  disabled,
  onClick,
}: {
  icon: string;
  title: string;
  subtitle: string;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 10,
        border: primary ? "none" : "1px solid var(--ks-border-strong)",
        background: primary ? "var(--ks-accent)" : "var(--ks-bg-subtle)",
        color: primary ? "var(--ks-accent-contrast)" : "var(--ks-text)",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        opacity: disabled ? 0.6 : 1,
        fontFamily: "var(--font-sans)",
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</span>
        <span style={{ fontSize: 12.5, opacity: primary ? 0.75 : undefined, color: primary ? undefined : "var(--ks-text-muted)" }}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}
