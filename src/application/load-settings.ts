import type { AppConfig, ConfigStore } from "../domain/ports/config-store";
import type { SecretStore } from "../domain/ports/secret-store";
import type { Logger } from "../domain/ports/logger";

export interface LoadedSettings {
  config: AppConfig;
  /** true, если API-ключ уже сохранён — сам ключ наружу не отдаётся. */
  hasApiKey: boolean;
}

export class LoadSettings {
  constructor(
    private readonly configStore: ConfigStore,
    private readonly secretStore: SecretStore,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<LoadedSettings> {
    this.logger.debug("LoadSettings.execute", "loading settings");
    const config = await this.configStore.getConfig();
    const apiKey = await this.secretStore.getApiKey();
    const hasApiKey = apiKey !== null && apiKey.length > 0;
    this.logger.debug("LoadSettings.execute", "settings loaded", { hasApiKey });
    return { config, hasApiKey };
  }
}
