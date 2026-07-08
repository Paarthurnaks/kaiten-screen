import { app, Menu, nativeImage, Tray } from "electron";
import type { Logger } from "../domain/ports/logger";

// TODO(упаковка): заменить на настоящую иконку приложения в задаче "Упаковка
// Windows-инсталлятора" (build/icon.ico) — сейчас это плейсхолдер (сплошной квадрат
// 16x16), чтобы иконка в трее реально отображалась уже сейчас.
const PLACEHOLDER_ICON_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGPQztn8nxLMMGrAqAGjBgwXAwAwHUkf8/GuugAAAABJRU5ErkJggg==";

export interface TrayActions {
  onCapture: () => void;
  onOpenSettings: () => void;
}

let trayInstance: Tray | null = null;

/** Создаёт иконку в трее с меню: захват, настройки, выход. */
export function createTray(actions: TrayActions, logger: Logger): Tray {
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${PLACEHOLDER_ICON_BASE64}`);
  const tray = new Tray(icon);
  tray.setToolTip("Kaiten Screen");

  const menu = Menu.buildFromTemplate([
    {
      label: "Сделать скриншот",
      click: () => {
        logger.debug("Tray.menu", "capture clicked");
        actions.onCapture();
      },
    },
    {
      label: "Настройки",
      click: () => {
        logger.debug("Tray.menu", "settings clicked");
        actions.onOpenSettings();
      },
    },
    { type: "separator" },
    {
      label: "Выход",
      click: () => {
        logger.debug("Tray.menu", "quit clicked");
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);

  trayInstance = tray;
  logger.info("Tray.createTray", "tray icon created");
  return tray;
}

export function destroyTray(): void {
  trayInstance?.destroy();
  trayInstance = null;
}
