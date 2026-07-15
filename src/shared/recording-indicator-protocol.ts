/**
 * Внутренний IPC-протокол между окном recording-indicator (renderer) и
 * WindowsScreenRecording (main, infrastructure/platform/windows). Отдельная,
 * узкая договорённость — аналог capture-overlay-protocol.ts, но для записи видео.
 * Индикатор сам выполняет захват (getUserMedia/canvas/MediaRecorder), не проходит
 * через use-cases.
 */
export const RECORDING_INDICATOR_CHANNELS = {
  /** main -> indicator: параметры записи сразу после создания окна. */
  init: "internal:recording-indicator:init",
  /** indicator -> main: запись реально стартовала (getUserMedia+MediaRecorder готовы). */
  started: "internal:recording-indicator:started",
  /** indicator -> main: пользователь нажал "Стоп" в самом индикаторе. Индикатор НЕ
   * останавливает запись сам по этому клику — он лишь просит main провести тот же
   * путь остановки, что и хоткей-тоггл/трей (см. ScreenRecordingProvider.onUserRequestedStop),
   * иначе main не узнает, что запись завершена, и не откроет окно выбора действия. */
  stopClicked: "internal:recording-indicator:stop-clicked",
  /** main -> indicator: сигнал реально остановить запись — единственное место,
   * которое запускает recorder.stop(), приходит ли оно в ответ на хоткей-тоггл,
   * трей или клик по кнопке "Стоп" самого индикатора (см. stopClicked выше). */
  stopRequested: "internal:recording-indicator:stop-requested",
  /** indicator -> main: запись остановлена, вложены финальные байты видео. */
  finished: "internal:recording-indicator:finished",
  /** indicator -> main: не удалось запустить/завершить запись (ошибка getUserMedia
   * /MediaRecorder). */
  failed: "internal:recording-indicator:failed",
} as const;

export interface RecordingIndicatorInitPayload {
  /** id источника из desktopCapturer.getSources(), резолвится в main (renderer без
   * nodeIntegration не может вызвать desktopCapturer напрямую). */
  sourceId: string;
  /** Границы дисплея, на котором находится регион — в DIP (логических пикселях). */
  displayBounds: { x: number; y: number; width: number; height: number };
  /** scaleFactor дисплея — для пересчёта DIP -> физические пиксели, та же
   * математика, что и в WindowsScreenCapture.grabRegion(). */
  displayScaleFactor: number;
  /** Выбранный регион записи — в DIP, абсолютные координаты (та же система
   * координат, что и displayBounds). */
  region: { x: number; y: number; width: number; height: number };
  /** Жёсткий лимит длительности записи в секундах — из AppConfig.recordingMaxDurationSec. */
  maxDurationSec: number;
}

export interface RecordingFinishedPayload {
  /** Байты записанного видео. Structured clone передаёт ArrayBuffer как есть —
   * сериализация в обычный массив не требуется, main получает ArrayBuffer и
   * оборачивает в Buffer.from(...). */
  buffer: ArrayBuffer;
  mimeType: "video/webm";
}
