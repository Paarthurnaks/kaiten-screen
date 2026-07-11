import { app, Notification } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "../domain/ports/logger";

const LAST_VERSION_FILENAME = "last-seen-version.txt";

/**
 * Второй (и главный) сигнал пользователю о том, что автообновление сработало: если
 * версия приложения при этом запуске отличается от той, что была в прошлый раз —
 * показываем уведомление "Обновлено до vX.Y.Z". В отличие от уведомления в
 * auto-updater.ts (которое показывается сразу после скачивания, пока приложение ещё
 * старой версии), это — подтверждение уже post-factum, при следующем запуске новой
 * версии, на случай если пользователь не видел/пропустил первое уведомление.
 */
export function notifyIfVersionChanged(userDataDir: string, logger: Logger): void {
  const path = join(userDataDir, LAST_VERSION_FILENAME);
  const currentVersion = app.getVersion();
  const lastVersion = existsSync(path) ? readFileSync(path, "utf-8").trim() : null;

  if (lastVersion && lastVersion !== currentVersion) {
    logger.info("VersionNotice", "version changed since last run", { from: lastVersion, to: currentVersion });
    if (Notification.isSupported()) {
      new Notification({
        title: "Kaiten Screen обновлён",
        body: `Теперь установлена версия ${currentVersion}.`,
      }).show();
    }
  }

  if (lastVersion !== currentVersion) {
    writeFileSync(path, currentVersion, "utf-8");
  }
}
