import { app, Notification } from "electron";
// electron-updater — CommonJS-модуль; именованный импорт `{ autoUpdater }` компилируется
// TypeScript'ом без ошибок, но падает в рантайме под Node ESM ("Named export 'autoUpdater'
// not found") — обнаружено вживую при прогоне собранного приложения, не ловится
// typecheck'ом. Дефолтный импорт + деструктуризация — единственный рабочий вариант тут.
import electronUpdaterPkg from "electron-updater";
import type { Logger } from "../domain/ports/logger";

const { autoUpdater } = electronUpdaterPkg;

function notify(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body });
  if (onClick) notification.on("click", onClick);
  notification.show();
}

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
    // Сигнал, что обновление вообще есть и уже качается в фоне — иначе между кликом
    // "Проверить обновления"/фоновой проверкой и полной загрузкой (может занять минуту+
    // на большом .exe) пользователь не видит вообще ничего и не понимает, происходит ли
    // что-то. Второе уведомление — по факту готовности — см. update-downloaded ниже.
    notify("Kaiten Screen", `Доступна версия ${info.version} — скачиваю в фоне…`);
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
    // Клик по уведомлению — установить сразу, не дожидаясь следующего обычного закрытия.
    notify(
      "Kaiten Screen обновлён",
      `Версия ${info.version} скачана и будет установлена при следующем запуске. Нажмите, чтобы установить сейчас.`,
      () => {
        logger.debug("AutoUpdater", "update notification clicked — installing now");
        autoUpdater.quitAndInstall();
      },
    );
  });

  void autoUpdater.checkForUpdates();
}

/**
 * Ручная проверка обновлений — вызывается из пункта меню трея.
 *
 * autoUpdater — общий singleton с постоянными слушателями из setupAutoUpdater: они
 * молча логируют "нет обновлений"/"ошибка" (рассчитаны на фоновую проверку, где не
 * нужно дёргать пользователя лишний раз). Ручная проверка — по клику пользователя,
 * поэтому для этих двух исходов здесь добавляются одноразовые слушатели с notify(),
 * иначе пользователь видит просто закрывшееся меню и не понимает, что произошло.
 * update-available/update-downloaded уже покрыты постоянными слушателями — там
 * обратная связь есть.
 */
export function checkForUpdatesManually(logger: Logger): void {
  if (!app.isPackaged) {
    logger.debug("AutoUpdater.manualCheck", "skipped — app is not packaged (dev mode)");
    return;
  }

  const cleanup = () => {
    autoUpdater.off("update-not-available", onNotAvailable);
    autoUpdater.off("error", onError);
  };
  const onNotAvailable = () => {
    logger.debug("AutoUpdater.manualCheck", "no update available (manual check)");
    notify("Kaiten Screen", "У вас установлена последняя версия.");
    cleanup();
  };
  const onError = (err: Error) => {
    logger.error("AutoUpdater.manualCheck", "update check failed (manual check)", { error: String(err) });
    notify("Kaiten Screen", "Не удалось проверить обновления. Попробуйте позже.");
    cleanup();
  };

  autoUpdater.once("update-not-available", onNotAvailable);
  autoUpdater.once("error", onError);
  void autoUpdater.checkForUpdates();
}
