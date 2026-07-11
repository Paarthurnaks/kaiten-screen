import type { AppConfig } from "../domain/ports/config-store";

/**
 * Типизированный контракт между renderer (через preload/contextBridge) и main
 * (ipc-handlers, вызывающий use-cases). Renderer никогда не обращается к Electron/
 * Node API напрямую — только через этот контракт.
 */
export const IPC_CHANNELS = {
  getPendingCapture: "app:get-pending-capture",
  submitTask: "app:submit-task",
  loadSettings: "app:load-settings",
  saveSettings: "app:save-settings",
  listSpaces: "app:list-spaces",
  listBoards: "app:list-boards",
  listColumns: "app:list-columns",
  listLanes: "app:list-lanes",
  listUsers: "app:list-users",
  listCustomProperties: "app:list-custom-properties",
  searchCards: "app:search-cards",
  chooseCreateTask: "app:choose-create-task",
  chooseAttachExisting: "app:choose-attach-existing",
  cancelPendingCapture: "app:cancel-pending-capture",
  attachToExistingCard: "app:attach-to-existing-card",
  backToChoice: "app:back-to-choice",
  exportProjectConfig: "app:export-project-config",
  importProjectConfig: "app:import-project-config",
} as const;

export interface PendingCaptureDto {
  region: { x: number; y: number; width: number; height: number };
  /** data:image/png;base64,... — готово для использования в <img src>. */
  imageDataUrl: string;
}

export interface SubmitTaskInputDto {
  title: string;
  description?: string;
  boardId: string;
  laneId: string;
  columnId?: string;
  responsibleId?: string;
  properties?: Record<string, string | string[]>;
  participantIds?: string[];
}

export interface SubmitTaskResultDto {
  taskId: string;
  taskUrl: string;
  /** true — задача создана, но добавить хотя бы одного участника не удалось. */
  membersFailed: boolean;
  /** true — задача создана, но вложение прикрепить не удалось (частичный успех). */
  attachmentFailed: boolean;
}

export interface KaitenOptionDto {
  id: string;
  title: string;
}

export interface KaitenUserDto {
  id: string;
  fullName: string;
}

export interface KaitenCustomPropertyValueDto {
  id: string;
  label: string;
}

export interface KaitenCustomPropertyDto {
  id: string;
  name: string;
  multiSelect: boolean;
  values: KaitenCustomPropertyValueDto[];
}

export interface LoadedSettingsDto {
  config: AppConfig;
  hasApiKey: boolean;
}

export interface SaveSettingsInputDto {
  config?: Partial<AppConfig>;
  apiKey?: string;
}

export interface ExportProjectConfigResultDto {
  /** null — пользователь отменил диалог выбора файла. */
  path: string | null;
}

export interface ImportProjectConfigResultDto {
  /** false — пользователь отменил диалог выбора файла. */
  applied: boolean;
}

export interface KaitenScreenApi {
  getPendingCapture(): Promise<PendingCaptureDto | null>;
  submitTask(input: SubmitTaskInputDto): Promise<SubmitTaskResultDto>;
  loadSettings(): Promise<LoadedSettingsDto>;
  saveSettings(input: SaveSettingsInputDto): Promise<void>;
  listSpaces(): Promise<KaitenOptionDto[]>;
  listBoards(spaceId: string): Promise<KaitenOptionDto[]>;
  listColumns(boardId: string): Promise<KaitenOptionDto[]>;
  listLanes(boardId: string): Promise<KaitenOptionDto[]>;
  listUsers(): Promise<KaitenUserDto[]>;
  listCustomProperties(): Promise<KaitenCustomPropertyDto[]>;
  searchCards(query: string): Promise<KaitenOptionDto[]>;
  /** Экран выбора действия -> закрывает себя и открывает форму создания задачи. */
  chooseCreateTask(): Promise<void>;
  /** Экран выбора действия -> закрывает себя и открывает поиск существующей задачи. */
  chooseAttachExisting(): Promise<void>;
  /** Отмена на экране выбора действия/прикрепления — сбрасывает ожидающий скриншот и закрывает окно. */
  cancelPendingCapture(): Promise<void>;
  /** Прикрепляет ожидающий скриншот к существующей карточке и закрывает окно. */
  attachToExistingCard(cardId: string): Promise<void>;
  /** Экран формы задачи/прикрепления -> закрывает себя и возвращает на экран выбора
   * действия, не сбрасывая ожидающий скриншот (в отличие от cancelPendingCapture). */
  backToChoice(): Promise<void>;
  /** Открывает диалог "Сохранить как…" и пишет туда текущие настройки (включая
   * API-ключ) — см. main/config-file-transfer.ts. */
  exportProjectConfig(): Promise<ExportProjectConfigResultDto>;
  /** Открывает диалог "Открыть файл…" и применяет выбранный конфиг поверх текущих настроек. */
  importProjectConfig(): Promise<ImportProjectConfigResultDto>;
}
