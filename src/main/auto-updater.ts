import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { Logger } from "../domain/ports/logger";

/**
 * Автообновление через GitHub Releases (см. publish в electron-builder.yml).
 * electron-updater сам разбирается с NSIS-инсталлятором: скачивает новую версию в
 * фоне и ставит её при следующем закрытии приложения (autoInstallOnAppQuit).
 *
 * В dev-режиме (npm run dev / электрон запущен не из инсталлятора) ничего не делает —
 * electron-updater физически не может проверить версию неупакованного приложения.
 */
export function setupAutoUpdater(logger: Logger): void {
  if (!app.isPackaged) {
    logger.debug("AutoUpdater.setup", "skipped — app is not packaged (dev mode)");
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    logger.debug("AutoUpdater", "checking for update");
  });
  autoUpdater.on("update-available", (info) => {
    logger.info("AutoUpdater", "update available", { version: info.version });
  });
  autoUpdater.on("update-not-available", () => {
    logger.debug("AutoUpdater", "no update available", { currentVersion: app.getVersion() });
  });
  autoUpdater.on("error", (err) => {
    logger.error("AutoUpdater", "update check/download failed", { error: String(err) });
  });
  autoUpdater.on("download-progress", (progress) => {
    logger.debug("AutoUpdater", "download progress", { percent: Math.round(progress.percent) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    logger.info("AutoUpdater", "update downloaded — will install on next quit", { version: info.version });
  });

  void autoUpdater.checkForUpdates();
}

/** Ручная проверка обновлений — вызывается из пункта меню трея. */
export function checkForUpdatesManually(logger: Logger): void {
  if (!app.isPackaged) {
    logger.debug("AutoUpdater.manualCheck", "skipped — app is not packaged (dev mode)");
    return;
  }
  void autoUpdater.checkForUpdates();
}
