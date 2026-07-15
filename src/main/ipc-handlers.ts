import { BrowserWindow, clipboard, ipcMain, nativeImage } from "electron";
import { IPC_CHANNELS } from "../shared/ipc-contract";
import type {
  ExportProjectConfigResultDto,
  ImportProjectConfigResultDto,
  KaitenCustomPropertyDto,
  KaitenOptionDto,
  KaitenUserDto,
  LoadedSettingsDto,
  PendingCaptureDto,
  SaveRecordingResultDto,
  SaveSettingsInputDto,
  SubmitTaskInputDto,
  SubmitTaskResultDto,
} from "../shared/ipc-contract";
import type { CaptureAndCreateTask } from "../application/capture-and-create-task";
import type { LoadSettings } from "../application/load-settings";
import type { SaveSettings } from "../application/save-settings";
import type { ListKaitenOptions } from "../application/list-kaiten-options";
import type { Attachment } from "../domain/entities/attachment";
import type { CapturedVideo } from "../domain/entities/captured-video";
import type { AppConfig } from "../domain/ports/config-store";
import type { Logger } from "../domain/ports/logger";
import { showAttachTaskWindow, showPostCaptureChoiceWindow, showTaskFormWindow } from "./windows";
import type { PendingCapture } from "./index";

export interface IpcHandlerDeps {
  captureAndCreateTask: CaptureAndCreateTask;
  loadSettings: LoadSettings;
  saveSettings: SaveSettings;
  listKaitenOptions: ListKaitenOptions;
  getPendingCapture: () => PendingCapture | null;
  clearPendingCapture: () => void;
  /** Перерегистрирует оба глобальных хоткея (захват + запись) — вызывается, если
   * пользователь изменил captureHotkey/recordHotkey в настройках, чтобы изменение
   * подействовало без рестарта. */
  reregisterHotkeys: (config: Pick<AppConfig, "captureHotkey" | "recordHotkey">) => void;
  /** Применяет настройку автозапуска на уровне ОС — вызывается, если пользователь
   * изменил autostart в настройках. */
  applyAutostart: (enabled: boolean) => void;
  /** Открывает диалог "Сохранить как…" и пишет туда текущие настройки+API-ключ
   * (см. main/config-file-transfer.ts). Возвращает путь к файлу или null при отмене. */
  exportProjectConfig: (window: BrowserWindow | undefined) => Promise<string | null>;
  /** Открывает диалог "Открыть файл…" и применяет выбранный конфиг (хоткей/автозапуск
   * переприменяются, если изменились). Возвращает false при отмене диалога. */
  importProjectConfig: (window: BrowserWindow | undefined) => Promise<boolean>;
  /** Открывает диалог "Сохранить как…" и пишет туда байты видео (см.
   * main/recording-file-transfer.ts). Возвращает путь к файлу или null при отмене. */
  saveRecordingToFile: (window: BrowserWindow | undefined, video: CapturedVideo) => Promise<string | null>;
  logger: Logger;
}

function attachmentOf(pending: PendingCapture): Attachment {
  return pending.kind === "image" ? pending.image : pending.video;
}

/** Регистрирует IPC-хендлеры, вызывающие use-cases из application/. Ничего не решает сама —
 * только переводит DTO из shared/ipc-contract.ts в вызовы use-case и обратно. */
export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  const { logger } = deps;

  ipcMain.handle(IPC_CHANNELS.getPendingCapture, (): PendingCaptureDto | null => {
    logger.debug("IpcHandlers.getPendingCapture", "requested");
    const pending = deps.getPendingCapture();
    if (!pending) {
      return null;
    }
    logger.debug("IpcHandlers.getPendingCapture", "returning pending capture", { kind: pending.kind });
    const region = {
      x: pending.region.x,
      y: pending.region.y,
      width: pending.region.width,
      height: pending.region.height,
    };
    if (pending.kind === "video") {
      // new Uint8Array(buffer) копирует ровно byteLength байт независимо от
      // смещения/паддинга исходного Node Buffer — .buffer.buffer напрямую мог бы
      // отдать более крупный подлежащий ArrayBuffer с мусором за пределами среза.
      const videoBuffer = new Uint8Array(pending.video.buffer).buffer;
      return { kind: "video", region, videoBuffer, videoMimeType: "video/webm" };
    }
    const imageDataUrl = nativeImage.createFromBuffer(pending.image.buffer).toDataURL();
    return { kind: "image", region, imageDataUrl };
  });

  ipcMain.handle(
    IPC_CHANNELS.submitTask,
    async (_event, input: SubmitTaskInputDto): Promise<SubmitTaskResultDto> => {
      logger.debug("IpcHandlers.submitTask", "requested", { boardId: input.boardId, laneId: input.laneId });
      const pending = deps.getPendingCapture();
      if (!pending) {
        throw new Error("No pending capture to submit — capture a region first");
      }
      const result = await deps.captureAndCreateTask.submitStep(
        input,
        attachmentOf(pending),
        input.participantIds ?? [],
      );
      deps.clearPendingCapture();
      return {
        taskId: result.task.id,
        taskUrl: result.task.url,
        attachmentFailed: result.attachmentFailed,
        membersFailed: result.membersFailed,
      };
    },
  );

  ipcMain.handle(IPC_CHANNELS.loadSettings, (): Promise<LoadedSettingsDto> => deps.loadSettings.execute());

  ipcMain.handle(
    IPC_CHANNELS.saveSettings,
    async (_event, input: SaveSettingsInputDto): Promise<void> => {
      await deps.saveSettings.execute(input);
      if (input.config?.captureHotkey || input.config?.recordHotkey) {
        logger.debug("IpcHandlers.saveSettings", "hotkey changed, reregistering", {
          captureHotkey: Boolean(input.config?.captureHotkey),
          recordHotkey: Boolean(input.config?.recordHotkey),
        });
        const { config } = await deps.loadSettings.execute();
        deps.reregisterHotkeys(config);
      }
      if (input.config?.autostart !== undefined) {
        deps.applyAutostart(input.config.autostart);
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.listSpaces, async (): Promise<KaitenOptionDto[]> => {
    const spaces = await deps.listKaitenOptions.listSpaces();
    return spaces.map((space) => ({ id: space.id, title: space.title }));
  });

  ipcMain.handle(
    IPC_CHANNELS.listBoards,
    async (_event, spaceId: string): Promise<KaitenOptionDto[]> => {
      const boards = await deps.listKaitenOptions.listBoards(spaceId);
      return boards.map((board) => ({ id: board.id, title: board.title }));
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.listColumns,
    async (_event, boardId: string): Promise<KaitenOptionDto[]> => {
      const columns = await deps.listKaitenOptions.listColumns(boardId);
      return columns.map((column) => ({ id: column.id, title: column.title }));
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.listLanes,
    async (_event, boardId: string): Promise<KaitenOptionDto[]> => {
      const lanes = await deps.listKaitenOptions.listLanes(boardId);
      return lanes.map((lane) => ({ id: lane.id, title: lane.title }));
    },
  );

  ipcMain.handle(IPC_CHANNELS.listUsers, async (): Promise<KaitenUserDto[]> => {
    const users = await deps.listKaitenOptions.listUsers();
    return users.map((user) => ({ id: user.id, fullName: user.fullName }));
  });

  ipcMain.handle(IPC_CHANNELS.listCustomProperties, async (): Promise<KaitenCustomPropertyDto[]> => {
    const properties = await deps.listKaitenOptions.listCustomProperties();
    return properties.map((property) => ({
      id: property.id,
      name: property.name,
      multiSelect: property.multiSelect,
      values: property.values.map((value) => ({ id: value.id, label: value.label })),
    }));
  });

  ipcMain.handle(
    IPC_CHANNELS.searchCards,
    async (_event, query: string): Promise<KaitenOptionDto[]> => {
      const cards = await deps.listKaitenOptions.searchCards(query);
      return cards.map((card) => ({ id: card.id, title: card.title }));
    },
  );

  ipcMain.handle(IPC_CHANNELS.attachToExistingCard, async (_event, cardId: string): Promise<void> => {
    logger.debug("IpcHandlers.attachToExistingCard", "requested", { cardId });
    const pending = deps.getPendingCapture();
    if (!pending) {
      throw new Error("No pending capture to attach — capture a region first");
    }
    await deps.captureAndCreateTask.attachToExistingCard(cardId, attachmentOf(pending));
    deps.clearPendingCapture();
    // Окно не закрывается автоматически — renderer показывает состояние успеха
    // (как в TaskForm) и закрывает окно сам по клику пользователя.
  });

  ipcMain.handle(IPC_CHANNELS.copyToClipboard, (event): void => {
    logger.debug("IpcHandlers.copyToClipboard", "requested");
    const pending = deps.getPendingCapture();
    if (!pending) {
      throw new Error("No pending screenshot to copy — capture a region first");
    }
    if (pending.kind === "video") {
      // UI не должен показывать эту кнопку для видео (см. PostCaptureChoice.tsx) —
      // сюда доходим только при рассинхронизации, не ожидаемый путь выполнения.
      logger.warn("IpcHandlers.copyToClipboard", "attempted to copy a video attachment to clipboard");
      throw new Error("Copying a video recording to the clipboard is not supported");
    }
    clipboard.writeImage(nativeImage.createFromBuffer(pending.image.buffer));
    deps.clearPendingCapture();
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle(IPC_CHANNELS.saveRecordingToFile, async (event): Promise<SaveRecordingResultDto> => {
    logger.debug("IpcHandlers.saveRecordingToFile", "requested");
    const pending = deps.getPendingCapture();
    if (!pending || pending.kind !== "video") {
      throw new Error("No pending video recording to save — record a region first");
    }
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const path = await deps.saveRecordingToFile(window, pending.video);
    if (path) {
      // Диалог закрывает пользователь сам подтверждением сохранения — в отличие от
      // отмены (path === null), после которой окно выбора действия должно остаться
      // открытым, чтобы пользователь мог попробовать другое действие.
      deps.clearPendingCapture();
      BrowserWindow.fromWebContents(event.sender)?.close();
    }
    return { path };
  });

  ipcMain.handle(IPC_CHANNELS.chooseCreateTask, (event): void => {
    logger.debug("IpcHandlers.chooseCreateTask", "requested");
    BrowserWindow.fromWebContents(event.sender)?.close();
    showTaskFormWindow(logger);
  });

  ipcMain.handle(IPC_CHANNELS.chooseAttachExisting, (event): void => {
    logger.debug("IpcHandlers.chooseAttachExisting", "requested");
    BrowserWindow.fromWebContents(event.sender)?.close();
    showAttachTaskWindow(logger);
  });

  ipcMain.handle(IPC_CHANNELS.cancelPendingCapture, (event): void => {
    logger.debug("IpcHandlers.cancelPendingCapture", "requested");
    deps.clearPendingCapture();
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle(IPC_CHANNELS.backToChoice, (event): void => {
    logger.debug("IpcHandlers.backToChoice", "requested");
    BrowserWindow.fromWebContents(event.sender)?.close();
    showPostCaptureChoiceWindow(logger);
  });

  ipcMain.handle(IPC_CHANNELS.exportProjectConfig, async (event): Promise<ExportProjectConfigResultDto> => {
    logger.debug("IpcHandlers.exportProjectConfig", "requested");
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const path = await deps.exportProjectConfig(window);
    return { path };
  });

  ipcMain.handle(IPC_CHANNELS.importProjectConfig, async (event): Promise<ImportProjectConfigResultDto> => {
    logger.debug("IpcHandlers.importProjectConfig", "requested");
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const applied = await deps.importProjectConfig(window);
    return { applied };
  });

  logger.info("IpcHandlers.registerIpcHandlers", "all IPC handlers registered");
}
