import { app, dialog, type BrowserWindow } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig, ConfigStore } from "../domain/ports/config-store";
import type { SecretStore } from "../domain/ports/secret-store";
import type { Logger } from "../domain/ports/logger";

/**
 * Экспорт/импорт настроек через нативный диалог выбора файла — так это работает
 * одинаково и при разработке из исходников, и в собранном инсталляторе (у обычного
 * пользователя нет доступа к папке проекта, поэтому файл не привязан к фиксированному
 * пути и пользователь сам решает, куда сохранить/откуда загрузить).
 */
export interface ConfigFileContents {
  config?: Partial<AppConfig>;
  apiKey?: string;
}

const FILE_FILTERS = [{ name: "Kaiten Screen config", extensions: ["json"] }];

// Файл содержит расшифрованный API-ключ в открытом виде — абсолютный путь в "Документы"
// не даёт диалогу по умолчанию попасть в текущую рабочую директорию (которой при запуске
// из исходников может оказаться корень проекта — см. .gitignore за историей этого бага).
function defaultExportPath(): string {
  return join(app.getPath("documents"), "kaiten-screen-config.json");
}

/** Открывает диалог "Сохранить как…", пишет туда текущие настройки (включая
 * расшифрованный API-ключ — читается напрямую из secretStore, наружу в renderer не
 * уходит). Возвращает путь к файлу или null, если пользователь отменил диалог. */
export async function exportConfigToFile(
  window: BrowserWindow | undefined,
  configStore: ConfigStore,
  secretStore: SecretStore,
  logger: Logger,
): Promise<string | null> {
  const result = await (window
    ? dialog.showSaveDialog(window, {
        title: "Экспорт настроек Kaiten Screen",
        defaultPath: defaultExportPath(),
        filters: FILE_FILTERS,
      })
    : dialog.showSaveDialog({
        title: "Экспорт настроек Kaiten Screen",
        defaultPath: defaultExportPath(),
        filters: FILE_FILTERS,
      }));

  if (result.canceled || !result.filePath) {
    return null;
  }

  const config = await configStore.getConfig();
  const apiKey = await secretStore.getApiKey();
  const contents: ConfigFileContents = { config, ...(apiKey ? { apiKey } : {}) };
  writeFileSync(result.filePath, JSON.stringify(contents, null, 2), "utf-8");
  logger.info("ConfigFileTransfer.export", "exported config to file", { path: result.filePath });
  return result.filePath;
}

/** Открывает диалог "Открыть файл…" и применяет выбранный конфиг поверх текущих
 * настроек. Возвращает false, если пользователь отменил диалог. */
export async function importConfigFromFile(
  window: BrowserWindow | undefined,
  configStore: ConfigStore,
  secretStore: SecretStore,
  logger: Logger,
): Promise<boolean> {
  const result = await (window
    ? dialog.showOpenDialog(window, {
        title: "Импорт настроек Kaiten Screen",
        properties: ["openFile"],
        filters: FILE_FILTERS,
      })
    : dialog.showOpenDialog({
        title: "Импорт настроек Kaiten Screen",
        properties: ["openFile"],
        filters: FILE_FILTERS,
      }));

  if (result.canceled || result.filePaths.length === 0) {
    return false;
  }

  const path = result.filePaths[0];
  const contents = JSON.parse(readFileSync(path, "utf-8")) as ConfigFileContents;
  if (contents.config) {
    await configStore.setConfig(contents.config);
  }
  if (contents.apiKey) {
    await secretStore.setApiKey(contents.apiKey);
  }
  logger.info("ConfigFileTransfer.import", "imported config from file", { path });
  return true;
}
