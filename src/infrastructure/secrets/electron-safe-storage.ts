import { safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SecretStore } from "../../domain/ports/secret-store";
import type { Logger } from "../../domain/ports/logger";

/**
 * ElectronSafeStorage (implements SecretStore) — хранит API-ключ Kaiten зашифрованным
 * через Electron `safeStorage` (DPAPI на Windows) в файле в переданной директории
 * (обычно userData). Значение ключа никогда не попадает в логи.
 */
export class ElectronSafeStorage implements SecretStore {
  private readonly filePath: string;

  constructor(userDataDir: string, private readonly logger: Logger) {
    mkdirSync(userDataDir, { recursive: true });
    this.filePath = join(userDataDir, "kaiten-api-key.enc");
  }

  async getApiKey(): Promise<string | null> {
    if (!existsSync(this.filePath)) {
      return null;
    }
    this.assertEncryptionAvailable("getApiKey");
    const encrypted = readFileSync(this.filePath);
    const decrypted = safeStorage.decryptString(encrypted);
    this.logger.debug("ElectronSafeStorage.getApiKey", "api key read");
    return decrypted;
  }

  async setApiKey(apiKey: string): Promise<void> {
    this.assertEncryptionAvailable("setApiKey");
    const encrypted = safeStorage.encryptString(apiKey);
    writeFileSync(this.filePath, encrypted);
    this.logger.debug("ElectronSafeStorage.setApiKey", "api key saved");
  }

  async clearApiKey(): Promise<void> {
    if (existsSync(this.filePath)) {
      unlinkSync(this.filePath);
    }
    this.logger.debug("ElectronSafeStorage.clearApiKey", "api key cleared");
  }

  private assertEncryptionAvailable(scope: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      this.logger.error(`ElectronSafeStorage.${scope}`, "OS encryption is not available");
      throw new Error("Secure storage (safeStorage) is not available on this system");
    }
  }
}
