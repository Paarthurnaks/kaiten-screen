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
  listColumns: (boardId: string) => ipcRenderer.invoke(IPC_CHANNELS.listColumns, boardId),
  listLanes: (boardId: string) => ipcRenderer.invoke(IPC_CHANNELS.listLanes, boardId),
  listUsers: () => ipcRenderer.invoke(IPC_CHANNELS.listUsers),
  listCustomProperties: () => ipcRenderer.invoke(IPC_CHANNELS.listCustomProperties),
  searchCards: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.searchCards, query),
  chooseCreateTask: () => ipcRenderer.invoke(IPC_CHANNELS.chooseCreateTask),
  chooseAttachExisting: () => ipcRenderer.invoke(IPC_CHANNELS.chooseAttachExisting),
  cancelPendingCapture: () => ipcRenderer.invoke(IPC_CHANNELS.cancelPendingCapture),
  attachToExistingCard: (cardId: string) => ipcRenderer.invoke(IPC_CHANNELS.attachToExistingCard, cardId),
  copyToClipboard: () => ipcRenderer.invoke(IPC_CHANNELS.copyToClipboard),
  backToChoice: () => ipcRenderer.invoke(IPC_CHANNELS.backToChoice),
  exportProjectConfig: () => ipcRenderer.invoke(IPC_CHANNELS.exportProjectConfig),
  importProjectConfig: () => ipcRenderer.invoke(IPC_CHANNELS.importProjectConfig),
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
