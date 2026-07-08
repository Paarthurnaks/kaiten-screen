import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc-contract";
import type {
  KaitenScreenApi,
  SaveSettingsInputDto,
  SubmitTaskInputDto,
} from "../shared/ipc-contract";
import { CAPTURE_OVERLAY_CHANNELS } from "../shared/capture-overlay-protocol";
import type { CaptureOverlayRegionPayload } from "../shared/capture-overlay-protocol";

const kaitenScreenApi: KaitenScreenApi = {
  getPendingCapture: () => ipcRenderer.invoke(IPC_CHANNELS.getPendingCapture),
  submitTask: (input: SubmitTaskInputDto) => ipcRenderer.invoke(IPC_CHANNELS.submitTask, input),
  loadSettings: () => ipcRenderer.invoke(IPC_CHANNELS.loadSettings),
  saveSettings: (input: SaveSettingsInputDto) => ipcRenderer.invoke(IPC_CHANNELS.saveSettings, input),
  listSpaces: () => ipcRenderer.invoke(IPC_CHANNELS.listSpaces),
  listBoards: (spaceId: string) => ipcRenderer.invoke(IPC_CHANNELS.listBoards, spaceId),
  listLanes: (boardId: string) => ipcRenderer.invoke(IPC_CHANNELS.listLanes, boardId),
};

/** Отдельный узкий API только для окна capture-overlay (см. shared/capture-overlay-protocol.ts). */
const captureOverlayApi = {
  reportRegionSelected: (payload: CaptureOverlayRegionPayload): void => {
    ipcRenderer.send(CAPTURE_OVERLAY_CHANNELS.regionSelected, payload);
  },
  reportCancelled: (): void => {
    ipcRenderer.send(CAPTURE_OVERLAY_CHANNELS.cancelled);
  },
};

contextBridge.exposeInMainWorld("kaitenScreen", kaitenScreenApi);
contextBridge.exposeInMainWorld("captureOverlay", captureOverlayApi);
