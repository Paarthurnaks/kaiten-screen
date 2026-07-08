export interface AppConfig {
  kaitenDomain: string;
  defaultBoardId: string | null;
  defaultLaneId: string | null;
  captureHotkey: string;
  autostart: boolean;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  kaitenDomain: "",
  defaultBoardId: null,
  defaultLaneId: null,
  captureHotkey: "CommandOrControl+Shift+K",
  autostart: false,
};

/**
 * Хранилище несекретных настроек приложения (домен Kaiten, дефолтная доска/дорожка,
 * хоткей, автозапуск). API-ключ сюда не входит — см. domain/ports/secret-store.ts.
 */
export interface ConfigStore {
  getConfig(): Promise<AppConfig>;
  setConfig(patch: Partial<AppConfig>): Promise<void>;
}
