export interface AppConfig {
  kaitenDomain: string;
  defaultSpaceId: string | null;
  defaultBoardId: string | null;
  defaultColumnId: string | null;
  defaultLaneId: string | null;
  defaultResponsibleId: string | null;
  captureHotkey: string;
  /** Хоткей записи видео — работает как toggle (старт/стоп одной кнопкой),
   * независим от captureHotkey. */
  recordHotkey: string;
  /** Жёсткий лимит длительности записи видео в секундах (MVP-ограничение,
   * значение фиксируется только здесь, не хардкодится в коде записи). */
  recordingMaxDurationSec: number;
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
  recordHotkey: "CommandOrControl+Shift+R",
  recordingMaxDurationSec: 300,
  autostart: false,
};

/**
 * Хранилище несекретных настроек приложения (домен Kaiten, дефолтная доска/дорожка,
 * хоткей скриншота, хоткей записи видео, лимит длительности записи, автозапуск).
 * API-ключ сюда не входит — см. domain/ports/secret-store.ts.
 */
export interface ConfigStore {
  getConfig(): Promise<AppConfig>;
  setConfig(patch: Partial<AppConfig>): Promise<void>;
}
