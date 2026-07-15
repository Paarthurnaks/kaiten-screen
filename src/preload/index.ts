import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc-contract";
import type {
  KaitenScreenApi,
  SaveSettingsInputDto,
  SubmitTaskInputDto,
} from "../shared/ipc-contract";
import { CAPTURE_OVERLAY_CHANNELS } from "../shared/capture-overlay-protocol";
import type { CaptureOverlayRegionPayload } from "../shared/capture-overlay-protocol";
import { RECORDING_INDICATOR_CHANNELS } from "../shared/recording-indicator-protocol";
import type {
  RecordingFinishedPayload,
  RecordingIndicatorInitPayload,
} from "../shared/recording-indicator-protocol";

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
  updatePendingImage: (imageDataUrl: string) => ipcRenderer.invoke(IPC_CHANNELS.updatePendingImage, imageDataUrl),
  saveRecordingToFile: () => ipcRenderer.invoke(IPC_CHANNELS.saveRecordingToFile),
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

/** Отдельный узкий API только для окна recording-indicator (см.
 * shared/recording-indicator-protocol.ts) — само окно и показывает UI записи, и
 * выполняет захват (getUserMedia/canvas/MediaRecorder). */
const recordingControlApi = {
  onInit: (callback: (payload: RecordingIndicatorInitPayload) => void): void => {
    ipcRenderer.on(RECORDING_INDICATOR_CHANNELS.init, (_event, payload: RecordingIndicatorInitPayload) =>
      callback(payload),
    );
  },
  onStopRequested: (callback: () => void): void => {
    ipcRenderer.on(RECORDING_INDICATOR_CHANNELS.stopRequested, () => callback());
  },
  reportStarted: (): void => {
    ipcRenderer.send(RECORDING_INDICATOR_CHANNELS.started);
  },
  reportStopClicked: (): void => {
    ipcRenderer.send(RECORDING_INDICATOR_CHANNELS.stopClicked);
  },
  reportFinished: (payload: RecordingFinishedPayload): void => {
    ipcRenderer.send(RECORDING_INDICATOR_CHANNELS.finished, payload);
  },
  reportFailed: (message: string): void => {
    ipcRenderer.send(RECORDING_INDICATOR_CHANNELS.failed, message);
  },
};

contextBridge.exposeInMainWorld("kaitenScreen", kaitenScreenApi);
contextBridge.exposeInMainWorld("captureOverlay", captureOverlayApi);
contextBridge.exposeInMainWorld("recordingControl", recordingControlApi);
