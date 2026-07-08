import type { AppConfig, ConfigStore } from "../domain/ports/config-store";
import type { SecretStore } from "../domain/ports/secret-store";
import type { Logger } from "../domain/ports/logger";

export interface SaveSettingsInput {
  config?: Partial<AppConfig>;
  /** undefined — не менять ключ; "" — удалить сохранённый ключ; иначе — сохранить новый. */
  apiKey?: string;
}

export class SaveSettings {
  constructor(
    private readonly configStore: ConfigStore,
    private readonly secretStore: SecretStore,
    private readonly logger: Logger,
  ) {}

  async execute(input: SaveSettingsInput): Promise<void> {
    // ВАЖНО: значение apiKey никогда не передаётся в logger — только факт изменения.
    this.logger.debug("SaveSettings.execute", "saving settings", {
      changedConfigKeys: input.config ? Object.keys(input.config) : [],
      apiKeyChanged: input.apiKey !== undefined,
    });

    if (input.config) {
      await this.configStore.setConfig(input.config);
    }

    if (input.apiKey !== undefined) {
      if (input.apiKey.length === 0) {
        await this.secretStore.clearApiKey();
      } else {
        await this.secretStore.setApiKey(input.apiKey);
      }
    }

    this.logger.info("SaveSettings.execute", "settings saved");
  }
}
