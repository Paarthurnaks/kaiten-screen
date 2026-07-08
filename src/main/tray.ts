import { app, Menu, nativeImage, Tray } from "electron";
import type { Logger } from "../domain/ports/logger";

// TODO: build/icon.png (реальная иконка приложения, добавлена для electron-builder)
// используется только electron-builder при сборке инсталлятора/exe — в runtime она
// не бандлится и недоступна по пути отсюда. Чтобы трей показывал ту же иконку, нужно
// либо скопировать её в выход electron-vite (например через resources/ + extraResources
// в electron-builder.yml), либо явно завести отдельный ассет-пайплайн — не сделано в этом
// плане. Пока трей использует свой плейсхолдер (сплошной квадрат 16x16).
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
