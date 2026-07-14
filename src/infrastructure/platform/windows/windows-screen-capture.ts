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

  async captureRegion(): Promise<{ region: CaptureRegion; image: CapturedImage; action: "choice" | "clipboard" } | null> {
    this.logger.debug("WindowsScreenCapture.captureRegion", "opening capture overlay");

    const selection = await this.showOverlayAndWaitForSelection();
    if (!selection) {
      this.logger.debug("WindowsScreenCapture.captureRegion", "capture cancelled by user");
      return null;
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

  private showOverlayAndWaitForSelection(): Promise<{ region: CaptureRegion; action: "choice" | "clipboard" } | null> {
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
      let pendingSelection: { region: CaptureRegion; action: "choice" | "clipboard" } | null = null;

      // Закрытие BrowserWindow асинхронно на уровне ОС — если снимать скриншот сразу
      // после overlay.close(), компоситор Windows иногда ещё не убрал прозрачное окно
      // с экрана, и в кадр попадают его пунктирная рамка/тулбар/затемнение. Поэтому
      // ждём реального события "closed" и добавляем небольшую паузу перед resolve().
      const finish = (): void => {
        setTimeout(() => resolve(pendingSelection), 80);
      };

      const onSelected = (_event: unknown, payload: CaptureOverlayRegionPayload): void => {
        if (settled) return;
        settled = true;
        // payload.x/y приходят как clientX/clientY overlay-окна (относительно его
        // собственного клиентского прямоугольника), а не как абсолютные координаты
        // виртуального рабочего стола — переводим их в абсолютные, добавляя левый/
        // верхний край virtualBounds, с которого начинается сам overlay.
        pendingSelection = {
          region: CaptureRegion.create(
            virtualBounds.left + payload.x,
            virtualBounds.top + payload.y,
            payload.width,
            payload.height,
          ),
          action: payload.action,
        };
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
        pendingSelection = null;
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
          pendingSelection = null;
          removeIpcListeners();
        }
        // Отмена (cancel/Esc/закрытие окна) резолвится сразу null — пауза нужна только
        // перед снятием скриншота, см. finish().
        if (pendingSelection) {
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
