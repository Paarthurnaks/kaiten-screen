import { ipcMain, nativeImage } from "electron";
import { IPC_CHANNELS } from "../shared/ipc-contract";
import type {
  KaitenOptionDto,
  LoadedSettingsDto,
  PendingCaptureDto,
  SaveSettingsInputDto,
  SubmitTaskInputDto,
  SubmitTaskResultDto,
} from "../shared/ipc-contract";
import type { CaptureAndCreateTask } from "../application/capture-and-create-task";
import type { LoadSettings } from "../application/load-settings";
import type { SaveSettings } from "../application/save-settings";
import type { ListKaitenOptions } from "../application/list-kaiten-options";
import type { CaptureRegion } from "../domain/value-objects/capture-region";
import type { CapturedImage } from "../domain/entities/captured-image";
import type { Logger } from "../domain/ports/logger";

export interface IpcHandlerDeps {
  captureAndCreateTask: CaptureAndCreateTask;
  loadSettings: LoadSettings;
  saveSettings: SaveSettings;
  listKaitenOptions: ListKaitenOptions;
  getPendingCapture: () => { region: CaptureRegion; image: CapturedImage } | null;
  clearPendingCapture: () => void;
  logger: Logger;
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
    const imageDataUrl = nativeImage.createFromBuffer(pending.image.buffer).toDataURL();
    return {
      region: {
        x: pending.region.x,
        y: pending.region.y,
        width: pending.region.width,
        height: pending.region.height,
      },
      imageDataUrl,
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.submitTask,
    async (_event, input: SubmitTaskInputDto): Promise<SubmitTaskResultDto> => {
      logger.debug("IpcHandlers.submitTask", "requested", { boardId: input.boardId, laneId: input.laneId });
      const pending = deps.getPendingCapture();
      if (!pending) {
        throw new Error("No pending screenshot to submit — capture a region first");
      }
      const result = await deps.captureAndCreateTask.submitStep(input, pending.image);
      deps.clearPendingCapture();
      return {
        taskId: result.task.id,
        taskUrl: result.task.url,
        attachmentFailed: result.attachmentFailed,
      };
    },
  );

  ipcMain.handle(IPC_CHANNELS.loadSettings, (): Promise<LoadedSettingsDto> => deps.loadSettings.execute());

  ipcMain.handle(
    IPC_CHANNELS.saveSettings,
    async (_event, input: SaveSettingsInputDto): Promise<void> => {
      await deps.saveSettings.execute(input);
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
    IPC_CHANNELS.listLanes,
    async (_event, boardId: string): Promise<KaitenOptionDto[]> => {
      const lanes = await deps.listKaitenOptions.listLanes(boardId);
      return lanes.map((lane) => ({ id: lane.id, title: lane.title }));
    },
  );

  logger.info("IpcHandlers.registerIpcHandlers", "all IPC handlers registered");
}
