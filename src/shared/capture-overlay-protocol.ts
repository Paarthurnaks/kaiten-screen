/**
 * Внутренний IPC-протокол между окном capture-overlay (renderer) и
 * WindowsScreenCapture (main, infrastructure/platform/windows). Это отдельная,
 * более узкая договорённость, чем основной IPC-контракт приложения
 * (см. задачу "IPC-контракт, хендлеры и preload") — адаптер захвата экрана сам
 * управляет своим overlay-окном и не проходит через use-cases.
 */
export const CAPTURE_OVERLAY_CHANNELS = {
  regionSelected: "internal:capture-overlay:region-selected",
  cancelled: "internal:capture-overlay:cancelled",
} as const;

export interface CaptureOverlayRegionPayload {
  x: number;
  y: number;
  width: number;
  height: number;
}
