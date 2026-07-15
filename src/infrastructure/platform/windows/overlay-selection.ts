import { BrowserWindow, ipcMain, screen } from "electron";
import { join } from "node:path";
import { CaptureRegion } from "../../../domain/value-objects/capture-region";
import type { Logger } from "../../../domain/ports/logger";
import {
  CAPTURE_OVERLAY_CHANNELS,
  type CaptureOverlayRegionPayload,
} from "../../../shared/capture-overlay-protocol";

export type OverlayMode = "screenshot" | "record";

/**
 * Открывает прозрачный fullscreen overlay поверх всех мониторов для выделения
 * области и ждёт результат — переиспользуется и скриншот-флоу (WindowsScreenCapture,
 * mode="screenshot"), и флоу записи видео (WindowsScreenRecording, mode="record").
 * mode передаётся в overlay-окно через query-параметр URL — CaptureOverlay.tsx
 * читает его и переключает тулбар (см. capture-overlay/CaptureOverlay.tsx).
 *
 * __dirname здесь указывает на out/main/ (electron-vite бандлит весь main-процесс
 * в один файл), как и в остальных main-модулях.
 */
export function showOverlayAndWaitForSelection(
  mode: OverlayMode,
  logger: Logger,
): Promise<{ region: CaptureRegion; action: "choice" | "clipboard" | "record" } | null> {
  logger.debug("overlay-selection.showOverlayAndWaitForSelection", "opening capture overlay", { mode });

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
    let pendingSelection: { region: CaptureRegion; action: "choice" | "clipboard" | "record" } | null = null;

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
      logger.debug("overlay-selection.showOverlayAndWaitForSelection", "region selected", {
        mode,
        action: payload.action,
      });
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
      logger.debug("overlay-selection.showOverlayAndWaitForSelection", "selection cancelled", { mode });
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
      // перед снятием скриншота/стартом записи, см. finish().
      if (pendingSelection) {
        finish();
      } else {
        resolve(null);
      }
    });

    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (rendererUrl) {
      void overlay.loadURL(`${rendererUrl}/capture-overlay/index.html?mode=${mode}`);
    } else {
      void overlay.loadFile(join(__dirname, "../renderer/capture-overlay/index.html"), { query: { mode } });
    }
  });
}
