import type { CaptureRegion } from "../value-objects/capture-region";
import type { CapturedImage } from "../entities/captured-image";

/**
 * Точка расширения под будущие платформы (Windows сейчас, macOS позже) и режимы
 * захвата (скриншот сейчас, видео позже) — см. ARCHITECTURE.md.
 */
export interface ScreenCaptureProvider {
  /** Показывает overlay выбора области и возвращает захваченное изображение, либо
   * null, если пользователь отменил захват (например, Esc). */
  captureRegion(): Promise<{ region: CaptureRegion; image: CapturedImage } | null>;
}
