/**
 * Безопасное хранилище API-ключа Kaiten. Реализация — Electron `safeStorage`
 * (DPAPI на Windows), см. infrastructure/secrets/electron-safe-storage.ts.
 */
export interface SecretStore {
  getApiKey(): Promise<string | null>;
  setApiKey(apiKey: string): Promise<void>;
  clearApiKey(): Promise<void>;
}
