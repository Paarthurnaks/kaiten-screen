import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig, ConfigStore } from "../../domain/ports/config-store";
import { DEFAULT_APP_CONFIG } from "../../domain/ports/config-store";
import type { Logger } from "../../domain/ports/logger";

/**
 * JsonConfigStore (implements ConfigStore) — несекретные настройки приложения в
 * JSON-файле в переданной директории (обычно userData). При отсутствующем или
 * повреждённом файле — fallback на DEFAULT_APP_CONFIG, без падения приложения.
 */
export class JsonConfigStore implements ConfigStore {
  private readonly filePath: string;

  constructor(userDataDir: string, private readonly logger: Logger) {
    mkdirSync(userDataDir, { recursive: true });
    this.filePath = join(userDataDir, "config.json");
  }

  async getConfig(): Promise<AppConfig> {
    if (!existsSync(this.filePath)) {
      this.logger.debug("JsonConfigStore.getConfig", "config file not found, using defaults", {
        path: this.filePath,
      });
      return { ...DEFAULT_APP_CONFIG };
    }

    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
      this.logger.debug("JsonConfigStore.getConfig", "config loaded", { path: this.filePath });
      return { ...DEFAULT_APP_CONFIG, ...parsed };
    } catch (err) {
      this.logger.error("JsonConfigStore.getConfig", "config file corrupted, falling back to defaults", {
        path: this.filePath,
        error: String(err),
      });
      return { ...DEFAULT_APP_CONFIG };
    }
  }

  async setConfig(patch: Partial<AppConfig>): Promise<void> {
    const current = await this.getConfig();
    const next: AppConfig = { ...current, ...patch };
    writeFileSync(this.filePath, JSON.stringify(next, null, 2), "utf8");
    this.logger.debug("JsonConfigStore.setConfig", "config saved", { changedKeys: Object.keys(patch) });
  }
}
