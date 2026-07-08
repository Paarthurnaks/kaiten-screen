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
  listLanes: "app:list-lanes",
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
}

export interface SubmitTaskResultDto {
  taskId: string;
  taskUrl: string;
  /** true — задача создана, но вложение прикрепить не удалось (частичный успех). */
  attachmentFailed: boolean;
}

export interface KaitenOptionDto {
  id: string;
  title: string;
}

export interface LoadedSettingsDto {
  config: AppConfig;
  hasApiKey: boolean;
}

export interface SaveSettingsInputDto {
  config?: Partial<AppConfig>;
  apiKey?: string;
}

export interface KaitenScreenApi {
  getPendingCapture(): Promise<PendingCaptureDto | null>;
  submitTask(input: SubmitTaskInputDto): Promise<SubmitTaskResultDto>;
  loadSettings(): Promise<LoadedSettingsDto>;
  saveSettings(input: SaveSettingsInputDto): Promise<void>;
  listSpaces(): Promise<KaitenOptionDto[]>;
  listBoards(spaceId: string): Promise<KaitenOptionDto[]>;
  listLanes(boardId: string): Promise<KaitenOptionDto[]>;
}
