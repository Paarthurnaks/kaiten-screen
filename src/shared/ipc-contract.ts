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
  copyToClipboard: "app:copy-to-clipboard",
  saveRecordingToFile: "app:save-recording-to-file",
  backToChoice: "app:back-to-choice",
  exportProjectConfig: "app:export-project-config",
  importProjectConfig: "app:import-project-config",
} as const;

export type PendingCaptureDto =
  | {
      kind: "image";
      region: { x: number; y: number; width: number; height: number };
      /** data:image/png;base64,... — готово для использования в <img src>. */
      imageDataUrl: string;
    }
  | {
      kind: "video";
      region: { x: number; y: number; width: number; height: number };
      /** Сырые байты видео — renderer сам собирает Blob + URL.createObjectURL()
       * (см. renderer/shared/use-pending-video-url.ts). data:video/webm;base64 URL
       * для крупных видео капризно ведёт себя в <video> (пустой кадр/битая
       * перемотка) — обычный Blob надёжнее и не тратит +33% на base64. */
      videoBuffer: ArrayBuffer;
      videoMimeType: "video/webm";
    };

export interface SubmitTaskInputDto {
  title: string;
  description?: string;
  boardId: string;
  laneId: string;
  columnId?: string;
  responsibleId?: string;
  /** Нужно для построения корректной ссылки на созданную карточку — см.
   * infrastructure/kaiten/kaiten-http-client.ts createTask. */
  spaceId?: string;
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

export interface SaveRecordingResultDto {
  /** null — пользователь отменил диалог сохранения. */
  path: string | null;
}

export interface KaitenScreenApi {
  /** Возвращает ожидающий скриншот либо запись видео (см. PendingCaptureDto.kind),
   * либо null, если ничего не ожидает обработки. */
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
  /** Копирует ожидающий скриншот в системный буфер обмена и закрывает окно — позволяет
   * пользоваться приложением как обычным скриншотером, без создания карточки в Kaiten. */
  copyToClipboard(): Promise<void>;
  /** Открывает диалог "Сохранить как…" и пишет туда байты ожидающей видеозаписи —
   * видео-аналог copyToClipboard (ОС не поддерживает copy/paste видео стандартным
   * способом). Закрывает окно только при реальном сохранении — если пользователь
   * отменил диалог, path === null и окно остаётся открытым. */
  saveRecordingToFile(): Promise<SaveRecordingResultDto>;
  /** Экран формы задачи/прикрепления -> закрывает себя и возвращает на экран выбора
   * действия, не сбрасывая ожидающий скриншот (в отличие от cancelPendingCapture). */
  backToChoice(): Promise<void>;
  /** Открывает диалог "Сохранить как…" и пишет туда текущие настройки (включая
   * API-ключ) — см. main/config-file-transfer.ts. */
  exportProjectConfig(): Promise<ExportProjectConfigResultDto>;
  /** Открывает диалог "Открыть файл…" и применяет выбранный конфиг поверх текущих настроек. */
  importProjectConfig(): Promise<ImportProjectConfigResultDto>;
}
