import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConfigStore } from "../domain/ports/config-store";
import type { SecretStore } from "../domain/ports/secret-store";
import type { Logger } from "../domain/ports/logger";
import type { ConfigFileContents } from "./config-file-transfer";

const SEED_FILENAME = "kaiten-screen.local-config.json";

/** out/main/index.js (весь main-процесс собирается electron-vite в один файл) -> ../.. это
 * корень проекта. В запакованной сборке этот путь ведёт внутрь resources/app.asar, где
 * файла нет — seedConfigFromProjectFileIfEmpty() в этом случае просто ничего не находит. */
function resolveSeedPath(): string {
  return join(__dirname, "..", "..", SEED_FILENAME);
}

/**
 * Дев-удобство: если настройки ещё пустые (свежий профиль, домен не задан) и рядом с
 * проектом лежит kaiten-screen.local-config.json (см. config-file-transfer.ts за форматом,
 * файл — то же, что создаёт кнопка "Сохранить в файл…" в Настройках) — применяет его один
 * раз при старте. В отличие от прежней версии этого механизма, НЕ переприменяется на каждом
 * запуске и поэтому не может затереть настройки, которые пользователь уже сохранил через UI.
 */
export async function seedConfigFromProjectFileIfEmpty(
  configStore: ConfigStore,
  secretStore: SecretStore,
  logger: Logger,
): Promise<boolean> {
  const current = await configStore.getConfig();
  if (current.kaitenDomain) {
    return false;
  }

  const path = resolveSeedPath();
  if (!existsSync(path)) {
    return false;
  }

  try {
    const contents = JSON.parse(readFileSync(path, "utf-8")) as ConfigFileContents;
    if (contents.config) {
      await configStore.setConfig(contents.config);
    }
    if (contents.apiKey) {
      await secretStore.setApiKey(contents.apiKey);
    }
    logger.info("ProjectConfigSeed.apply", "seeded empty config from project file", { path });
    return true;
  } catch (err) {
    logger.error("ProjectConfigSeed.apply", "failed to parse seed file", { path, error: String(err) });
    return false;
  }
}
