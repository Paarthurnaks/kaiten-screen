import { useCallback, useEffect, useRef, useState } from "react";
import type { RecordingIndicatorInitPayload } from "../../shared/recording-indicator-protocol";

type Status = "waiting" | "recording" | "stopping" | "error";

const LOG_PREFIX = "[RecordingIndicator]";

/** Legacy Chrome desktop-capture constraint shape — не описан в стандартном
 * MediaTrackConstraints, поэтому конструируем и приводим тип отдельно. */
interface DesktopCaptureConstraints {
  audio: false;
  video: {
    mandatory: {
      chromeMediaSource: "desktop";
      chromeMediaSourceId: string;
      minWidth: number;
      maxWidth: number;
      minHeight: number;
      maxHeight: number;
    };
  };
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function pickMimeType(): string {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "video/webm";
}

export function RecordingIndicator() {
  const [status, setStatus] = useState<Status>("waiting");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("video/webm");
  const rafIdRef = useRef<number | null>(null);
  const timerIdRef = useRef<number | null>(null);
  const maxDurationRef = useRef<number>(300);
  const stoppingRef = useRef(false);

  const stopAndFinish = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    console.debug(LOG_PREFIX, "stopping recording");
    setStatus("stopping");

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (timerIdRef.current !== null) {
      window.clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      // Останов запрошен раньше, чем MediaRecorder успел стартовать — ничего
      // записывать не пришлось, финализировать нечего.
      window.recordingControl.reportFailed("stopped before recording actually started");
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const startCapture = async (payload: RecordingIndicatorInitPayload): Promise<void> => {
      maxDurationRef.current = payload.maxDurationSec;
      console.debug(LOG_PREFIX, "received init payload", {
        displayScaleFactor: payload.displayScaleFactor,
        region: payload.region,
        maxDurationSec: payload.maxDurationSec,
      });

      try {
        const physicalWidth = Math.round(payload.displayBounds.width * payload.displayScaleFactor);
        const physicalHeight = Math.round(payload.displayBounds.height * payload.displayScaleFactor);
        const constraints: DesktopCaptureConstraints = {
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: payload.sourceId,
              minWidth: physicalWidth,
              maxWidth: physicalWidth,
              minHeight: physicalHeight,
              maxHeight: physicalHeight,
            },
          },
        };

        console.debug(LOG_PREFIX, "requesting getUserMedia", { physicalWidth, physicalHeight });
        const stream = await navigator.mediaDevices.getUserMedia(
          constraints as unknown as MediaStreamConstraints,
        );
        streamRef.current = stream;

        const videoEl = document.createElement("video");
        videoEl.muted = true;
        videoEl.srcObject = stream;
        await videoEl.play();
        console.debug(LOG_PREFIX, "source video element playing", {
          videoWidth: videoEl.videoWidth,
          videoHeight: videoEl.videoHeight,
        });

        // Обрезка по выделенному прямоугольнику: та же математика DIP -> физические
        // пиксели, что и в WindowsScreenCapture.grabRegion() (crop относительно
        // левого-верхнего угла дисплея, умноженный на scaleFactor).
        const sx = Math.round((payload.region.x - payload.displayBounds.x) * payload.displayScaleFactor);
        const sy = Math.round((payload.region.y - payload.displayBounds.y) * payload.displayScaleFactor);
        const sw = Math.round(payload.region.width * payload.displayScaleFactor);
        const sh = Math.round(payload.region.height * payload.displayScaleFactor);

        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("2D canvas context is not available");
        }

        const drawFrame = (): void => {
          ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, sw, sh);
          rafIdRef.current = requestAnimationFrame(drawFrame);
        };
        drawFrame();

        const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
        const mimeType = pickMimeType();
        mimeTypeRef.current = mimeType;
        console.debug(LOG_PREFIX, "starting MediaRecorder", { mimeType, sx, sy, sw, sh });

        const recorder = new MediaRecorder(canvasStream, { mimeType });
        recorderRef.current = recorder;

        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.onstart = () => {
          console.debug(LOG_PREFIX, "MediaRecorder started");
          window.recordingControl.reportStarted();
          setStatus("recording");

          const startedAt = Date.now();
          timerIdRef.current = window.setInterval(() => {
            const seconds = Math.floor((Date.now() - startedAt) / 1000);
            setElapsedSec(seconds);
            if (seconds % 10 === 0) {
              console.debug(LOG_PREFIX, "recording elapsed", { seconds });
            }
            if (seconds >= maxDurationRef.current) {
              console.debug(LOG_PREFIX, "max duration reached, auto-stopping", {
                seconds,
                maxDurationSec: maxDurationRef.current,
              });
              stopAndFinish();
            }
          }, 1000);
        };

        recorder.onstop = async () => {
          try {
            const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
            const buffer = await blob.arrayBuffer();
            console.debug(LOG_PREFIX, "recording finished", { byteLength: buffer.byteLength });
            window.recordingControl.reportFinished({ buffer, mimeType: "video/webm" });
          } catch (err) {
            console.error(LOG_PREFIX, "failed to finalize recording", err);
            window.recordingControl.reportFailed(String(err));
          }
        };

        recorder.onerror = (event: Event) => {
          console.error(LOG_PREFIX, "MediaRecorder error", event);
          window.recordingControl.reportFailed("MediaRecorder error");
        };

        recorder.start(1000);
      } catch (err) {
        console.error(LOG_PREFIX, "failed to start capture", err);
        setStatus("error");
        setErrorMessage(String(err));
        window.recordingControl.reportFailed(String(err));
      }
    };

    window.recordingControl.onInit((payload) => void startCapture(payload));
    window.recordingControl.onStopRequested(() => stopAndFinish());

    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      if (timerIdRef.current !== null) window.clearInterval(timerIdRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [stopAndFinish]);

  return (
    <div
      style={{
        // @ts-expect-error -- WebkitAppRegion не типизирован в CSSProperties, но
        // поддерживается Chromium/Electron для перетаскивания frameless-окон.
        WebkitAppRegion: "drag",
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: "100%",
        padding: "0 12px",
        boxSizing: "border-box",
        background: "var(--ks-bg-chip)",
        border: "1px solid var(--ks-border-strong)",
        borderRadius: 12,
        fontFamily: "var(--font-sans)",
        color: "var(--ks-text)",
      }}
    >
      {status === "recording" && (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#ef4444",
            flexShrink: 0,
          }}
        />
      )}
      <span className="ks-chip-mono" style={{ flex: 1, textAlign: "center" }}>
        {status === "waiting" && "Подготовка…"}
        {status === "recording" && formatElapsed(elapsedSec)}
        {status === "stopping" && "Завершение…"}
        {status === "error" && (errorMessage ? "Ошибка" : "Ошибка записи")}
      </span>
      <button
        type="button"
        onClick={stopAndFinish}
        disabled={status !== "recording"}
        title="Остановить запись"
        style={{
          // @ts-expect-error -- см. комментарий выше про WebkitAppRegion.
          WebkitAppRegion: "no-drag",
          height: 28,
          width: 28,
          borderRadius: 8,
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: status === "recording" ? "var(--ks-accent)" : "var(--ks-bg-subtle)",
          color: status === "recording" ? "var(--ks-accent-contrast)" : "var(--ks-text-faint)",
          cursor: status === "recording" ? "pointer" : "default",
          flexShrink: 0,
        }}
      >
        ⏹
      </button>
    </div>
  );
}
