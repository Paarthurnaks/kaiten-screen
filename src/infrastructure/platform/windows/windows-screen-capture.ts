import { BrowserWindow, desktopCapturer, ipcMain, screen } from "electron";
import { join } from "node:path";
import type { ScreenCaptureProvider } from "../../../domain/ports/screen-capture-provider";
import { CaptureRegion } from "../../../domain/value-objects/capture-region";
import type { CapturedImage } from "../../../domain/entities/captured-image";
import type { Logger } from "../../../domain/ports/logger";
import {
  CAPTURE_OVERLAY_CHANNELS,
  type CaptureOverlayRegionPayload,
} from "../../../shared/capture-overlay-protocol";

/**
 * WindowsScreenCapture (implements ScreenCaptureProvider) — открывает прозрачный
 * fullscreen overlay поверх всех мониторов для выделения области, затем захватывает
 * экран через desktopCapturer и обрезает изображение по выбранному региону.
 *
 * __dirname здесь и в остальных main-модулях указывает на out/main/ (electron-vite
 * бандлит весь main-процесс в один файл), поэтому пути к preload/renderer такие же,
 * как в src/main/index.ts, а не относительно исходного расположения этого файла.
 */
export class WindowsScreenCapture implements ScreenCaptureProvider {
  constructor(private readonly logger: Logger) {}

  async captureRegion(): Promise<{ region: CaptureRegion; image: CapturedImage } | null> {
    this.logger.debug("WindowsScreenCapture.captureRegion", "opening capture overlay");

    const region = await this.showOverlayAndWaitForSelection();
    if (!region) {
      this.logger.debug("WindowsScreenCapture.captureRegion", "capture cancelled by user");
      return null;
    }

    const image = await this.grabRegion(region);
    this.logger.info("WindowsScreenCapture.captureRegion", "capture succeeded", {
      width: region.width,
      height: region.height,
    });
    return { region, image };
  }

  private showOverlayAndWaitForSelection(): Promise<CaptureRegion | null> {
    return new Promise((resolve) => {
      const displays = screen.getAllDisplays();
      const virtualBounds = displays.reduce(
        (acc, display) => ({
          left: Math.min(acc.left, display.bounds.x),
          top: Math.min(acc.top, display.bounds.y),
          right: Math.max(acc.right, display.bounds.x + display.bounds.width),
          bottom: Math.max(acc.bottom, display.bounds.y + display.bounds.height),
        }),
        { left: 0, top: 0, right: 0, bottom: 0 },
      );

      const overlay = new BrowserWindow({
        x: virtualBounds.left,
        y: virtualBounds.top,
        width: virtualBounds.right - virtualBounds.left,
        height: virtualBounds.bottom - virtualBounds.top,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        webPreferences: {
          preload: join(__dirname, "../preload/index.cjs"),
        },
      });

      let settled = false;
      let pendingRegion: CaptureRegion | null = null;

      // Закрытие BrowserWindow асинхронно на уровне ОС — если снимать скриншот сразу
      // после overlay.close(), компоситор Windows иногда ещё не убрал прозрачное окно
      // с экрана, и в кадр попадают его пунктирная рамка/тулбар/затемнение. Поэтому
      // ждём реального события "closed" и добавляем небольшую паузу перед resolve().
      const finish = (): void => {
        setTimeout(() => resolve(pendingRegion), 80);
      };

      const onSelected = (_event: unknown, payload: CaptureOverlayRegionPayload): void => {
        if (settled) return;
        settled = true;
        pendingRegion = CaptureRegion.create(payload.x, payload.y, payload.width, payload.height);
        removeIpcListeners();
        if (overlay.isDestroyed()) {
          finish();
        } else {
          overlay.close();
        }
      };
      const onCancelled = (): void => {
        if (settled) return;
        settled = true;
        pendingRegion = null;
        removeIpcListeners();
        if (!overlay.isDestroyed()) {
          overlay.close();
        }
      };
      const removeIpcListeners = (): void => {
        ipcMain.removeListener(CAPTURE_OVERLAY_CHANNELS.regionSelected, onSelected);
        ipcMain.removeListener(CAPTURE_OVERLAY_CHANNELS.cancelled, onCancelled);
      };

      ipcMain.on(CAPTURE_OVERLAY_CHANNELS.regionSelected, onSelected);
      ipcMain.on(CAPTURE_OVERLAY_CHANNELS.cancelled, onCancelled);

      overlay.on("closed", () => {
        if (!settled) {
          settled = true;
          pendingRegion = null;
          removeIpcListeners();
        }
        // Отмена (cancel/Esc/закрытие окна) резолвится сразу null — пауза нужна только
        // перед снятием скриншота, см. finish().
        if (pendingRegion) {
          finish();
        } else {
          resolve(null);
        }
      });

      const rendererUrl = process.env.ELECTRON_RENDERER_URL;
      if (rendererUrl) {
        void overlay.loadURL(`${rendererUrl}/capture-overlay/index.html`);
      } else {
        void overlay.loadFile(join(__dirname, "../renderer/capture-overlay/index.html"));
      }
    });
  }

  private async grabRegion(region: CaptureRegion): Promise<CapturedImage> {
    const primaryDisplay = screen.getPrimaryDisplay();
    // TODO: при мультимониторной настройке точнее выбирать источник desktopCapturer
    // под конкретный дисплей, на котором выделен регион, а не всегда первичный экран.
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.round(primaryDisplay.size.width * primaryDisplay.scaleFactor),
        height: Math.round(primaryDisplay.size.height * primaryDisplay.scaleFactor),
      },
    });

    const source = sources[0];
    if (!source) {
      this.logger.error("WindowsScreenCapture.grabRegion", "no screen source available");
      throw new Error("No screen source available for capture");
    }

    const cropped = source.thumbnail.crop({
      x: Math.round(region.x),
      y: Math.round(region.y),
      width: Math.round(region.width),
      height: Math.round(region.height),
    });

    return { buffer: cropped.toPNG(), mimeType: "image/png" };
  }
}
