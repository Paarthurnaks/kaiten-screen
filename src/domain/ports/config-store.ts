export interface AppConfig {
  kaitenDomain: string;
  defaultSpaceId: string | null;
  defaultBoardId: string | null;
  defaultColumnId: string | null;
  defaultLaneId: string | null;
  defaultResponsibleId: string | null;
  captureHotkey: string;
  autostart: boolean;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  kaitenDomain: "",
  defaultSpaceId: null,
  defaultBoardId: null,
  defaultColumnId: null,
  defaultLaneId: null,
  defaultResponsibleId: null,
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
