import { desktopCapturer, screen } from "electron";
import type { ScreenCaptureProvider } from "../../../domain/ports/screen-capture-provider";
import type { CaptureRegion } from "../../../domain/value-objects/capture-region";
import type { CapturedImage } from "../../../domain/entities/captured-image";
import type { Logger } from "../../../domain/ports/logger";
import { showOverlayAndWaitForSelection } from "./overlay-selection";

/**
 * WindowsScreenCapture (implements ScreenCaptureProvider) — переиспользует общий
 * helper showOverlayAndWaitForSelection() (mode="screenshot") для выделения области,
 * затем захватывает экран через desktopCapturer и обрезает изображение по выбранному
 * региону.
 *
 * __dirname здесь и в остальных main-модулях указывает на out/main/ (electron-vite
 * бандлит весь main-процесс в один файл), поэтому пути к preload/renderer такие же,
 * как в src/main/index.ts, а не относительно исходного расположения этого файла.
 */
export class WindowsScreenCapture implements ScreenCaptureProvider {
  constructor(private readonly logger: Logger) {}

  async captureRegion(): Promise<{ region: CaptureRegion; image: CapturedImage; action: "choice" | "clipboard" } | null> {
    this.logger.debug("WindowsScreenCapture.captureRegion", "opening capture overlay");

    const selection = await showOverlayAndWaitForSelection("screenshot", this.logger);
    if (!selection) {
      this.logger.debug("WindowsScreenCapture.captureRegion", "capture cancelled by user");
      return null;
    }
    if (selection.action === "record") {
      // Оверлей в mode="screenshot" никогда не должен присылать action:"record" —
      // это защита от рассинхронизации протокола, а не ожидаемый путь выполнения.
      throw new Error("Unexpected 'record' action from screenshot overlay");
    }

    const { region, action } = selection;
    const image = await this.grabRegion(region);
    this.logger.info("WindowsScreenCapture.captureRegion", "capture succeeded", {
      width: region.width,
      height: region.height,
      action,
    });
    return { region, image, action };
  }

  private async grabRegion(region: CaptureRegion): Promise<CapturedImage> {
    // Регион приходит в логических пикселях (DIP) экрана, на котором его выделили,
    // а desktopCapturer отдаёт кадр в физических пикселях — на масштабировании
    // Windows выше 100% (125%/150%, обычный дефолт на многих ноутбуках) без учёта
    // scaleFactor кроп получался меньше и смещён к левому верхнему углу от
    // реально выделенной области, из-за чего вставленный скриншот выглядел обрезанным.
    const display = screen.getDisplayNearestPoint({
      x: Math.round(region.x + region.width / 2),
      y: Math.round(region.y + region.height / 2),
    });

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor),
      },
    });

    const source = sources.find((candidate) => candidate.display_id === String(display.id)) ?? sources[0];
    if (!source) {
      this.logger.error("WindowsScreenCapture.grabRegion", "no screen source available");
      throw new Error("No screen source available for capture");
    }

    const cropped = source.thumbnail.crop({
      x: Math.round((region.x - display.bounds.x) * display.scaleFactor),
      y: Math.round((region.y - display.bounds.y) * display.scaleFactor),
      width: Math.round(region.width * display.scaleFactor),
      height: Math.round(region.height * display.scaleFactor),
    });

    return { buffer: cropped.toPNG(), mimeType: "image/png" };
  }
}
