import { app, Menu, Tray } from "electron";
import type { Logger } from "../domain/ports/logger";
import { createAppIcon } from "./app-icon";

export interface TrayActions {
  onCapture: () => void;
  /** Toggle: старт записи, если не идёт, иначе — стоп текущей (см. main/index.ts toggleRecording). */
  onToggleRecording: () => void;
  onOpenSettings: () => void;
  onCheckForUpdates: () => void;
}

let trayInstance: Tray | null = null;

/** Создаёт иконку в трее: левый клик — сразу захват области, правый клик — меню
 * (захват/настройки/выход). На Windows setContextMenu() биндит меню на оба клика,
 * поэтому используем click/right-click вручную вместо setContextMenu(). */
export function createTray(actions: TrayActions, logger: Logger): Tray {
  const tray = new Tray(createAppIcon());
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
      label: "Записать видео",
      click: () => {
        logger.debug("Tray.menu", "toggle recording clicked");
        actions.onToggleRecording();
      },
    },
    {
      label: "Настройки",
      click: () => {
        logger.debug("Tray.menu", "settings clicked");
        actions.onOpenSettings();
      },
    },
    {
      label: "Проверить обновления",
      click: () => {
        logger.debug("Tray.menu", "check for updates clicked");
        actions.onCheckForUpdates();
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

  tray.on("click", () => {
    logger.debug("Tray.click", "left click — capture");
    actions.onCapture();
  });
  tray.on("right-click", () => {
    logger.debug("Tray.click", "right click — menu");
    tray.popUpContextMenu(menu);
  });

  trayInstance = tray;
  logger.info("Tray.createTray", "tray icon created");
  return tray;
}

export function destroyTray(): void {
  trayInstance?.destroy();
  trayInstance = null;
}
