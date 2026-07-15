import { BrowserWindow, desktopCapturer, ipcMain, screen } from "electron";
import { join } from "node:path";
import type { ScreenRecordingProvider } from "../../../domain/ports/screen-recording-provider";
import type { CaptureRegion } from "../../../domain/value-objects/capture-region";
import type { CapturedVideo } from "../../../domain/entities/captured-video";
import type { ConfigStore } from "../../../domain/ports/config-store";
import type { Logger } from "../../../domain/ports/logger";
import { showOverlayAndWaitForSelection } from "./overlay-selection";
import {
  RECORDING_INDICATOR_CHANNELS,
  type RecordingFinishedPayload,
  type RecordingIndicatorInitPayload,
} from "../../../shared/recording-indicator-protocol";

const INDICATOR_WIDTH = 200;
const INDICATOR_HEIGHT = 72;
const INDICATOR_MARGIN = 16;
const START_TIMEOUT_MS = 10_000;
const STOP_TIMEOUT_MS = 15_000;

/**
 * WindowsScreenRecording (implements ScreenRecordingProvider) — переиспользует
 * showOverlayAndWaitForSelection() (mode="record") для выделения области, затем
 * открывает плавающее окно-индикатор (recording-indicator), которое само выполняет
 * захват (getUserMedia/canvas/MediaRecorder) и присылает результат обратно по IPC.
 */
export class WindowsScreenRecording implements ScreenRecordingProvider {
  private indicatorWindow: BrowserWindow | null = null;
  private userRequestedStopCallback: (() => void) | null = null;
  private onStopClicked: (() => void) | null = null;

  constructor(
    private readonly configStore: ConfigStore,
    private readonly logger: Logger,
  ) {}

  onUserRequestedStop(callback: () => void): void {
    this.userRequestedStopCallback = callback;
  }

  async selectRegion(): Promise<{ region: CaptureRegion } | null> {
    this.logger.debug("WindowsScreenRecording.selectRegion", "opening record overlay");
    const selection = await showOverlayAndWaitForSelection("record", this.logger);
    if (!selection) {
      this.logger.debug("WindowsScreenRecording.selectRegion", "selection cancelled by user");
      return null;
    }
    if (selection.action !== "record") {
      // Оверлей в mode="record" никогда не должен присылать другой action — защита
      // от рассинхронизации протокола, а не ожидаемый путь выполнения.
      throw new Error("Unexpected non-'record' action from record overlay");
    }

    const { region } = selection;
    try {
      await this.startIndicatorAndRecording(region);
      this.logger.info("WindowsScreenRecording.selectRegion", "recording started", {
        width: region.width,
        height: region.height,
      });
      return { region };
    } catch (err) {
      this.logger.error("WindowsScreenRecording.selectRegion", "failed to start recording", {
        error: String(err),
      });
      this.closeIndicatorWindow();
      return null;
    }
  }

  async stopRecording(): Promise<CapturedVideo | null> {
    const indicator = this.indicatorWindow;
    if (!indicator || indicator.isDestroyed()) {
      this.logger.debug("WindowsScreenRecording.stopRecording", "no active recording to stop");
      return null;
    }

    this.logger.debug("WindowsScreenRecording.stopRecording", "requesting stop");

    const result = await new Promise<CapturedVideo | null>((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.logger.error("WindowsScreenRecording.stopRecording", "timed out waiting for finished/failed");
        removeListeners();
        resolve(null);
      }, STOP_TIMEOUT_MS);

      const onFinished = (_event: unknown, payload: RecordingFinishedPayload): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        removeListeners();
        const buffer = Buffer.from(payload.buffer);
        this.logger.info("WindowsScreenRecording.stopRecording", "recording finished", {
          byteLength: buffer.byteLength,
        });
        resolve({ buffer, mimeType: "video/webm" });
      };
      const onFailed = (_event: unknown, message: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        removeListeners();
        this.logger.error("WindowsScreenRecording.stopRecording", "recording failed", { message });
        resolve(null);
      };
      const removeListeners = (): void => {
        ipcMain.removeListener(RECORDING_INDICATOR_CHANNELS.finished, onFinished);
        ipcMain.removeListener(RECORDING_INDICATOR_CHANNELS.failed, onFailed);
      };

      ipcMain.on(RECORDING_INDICATOR_CHANNELS.finished, onFinished);
      ipcMain.on(RECORDING_INDICATOR_CHANNELS.failed, onFailed);

      indicator.webContents.send(RECORDING_INDICATOR_CHANNELS.stopRequested);
    });

    this.closeIndicatorWindow();
    return result;
  }

  private async startIndicatorAndRecording(region: CaptureRegion): Promise<void> {
    const display = screen.getDisplayNearestPoint({
      x: Math.round(region.x + region.width / 2),
      y: Math.round(region.y + region.height / 2),
    });

    // thumbnailSize намеренно минимальный — здесь нужен только id источника для
    // getUserMedia в renderer, не превью (в отличие от grabRegion() для скриншотов).
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
    const source = sources.find((candidate) => candidate.display_id === String(display.id)) ?? sources[0];
    if (!source) {
      throw new Error("No screen source available for recording");
    }
    this.logger.debug("WindowsScreenRecording.startIndicatorAndRecording", "resolved source", {
      sourceId: source.id,
      displayId: display.id,
    });

    const indicator = new BrowserWindow({
      x: Math.round(display.bounds.x + display.bounds.width - INDICATOR_WIDTH - INDICATOR_MARGIN),
      y: Math.round(display.bounds.y + INDICATOR_MARGIN),
      width: INDICATOR_WIDTH,
      height: INDICATOR_HEIGHT,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: true,
      webPreferences: {
        preload: join(__dirname, "../preload/index.cjs"),
      },
    });
    // Исключает окно-индикатор из его же собственного захвата экрана (Windows
    // SetWindowDisplayAffinity WDA_EXCLUDEFROMCAPTURE через Electron API) — иначе
    // таймер/кнопка "Стоп" попали бы в записанное видео. Best-effort на Windows 10
    // 2004+/11; на более старых системах индикатор может остаться видимым в записи
    // (известное ограничение MVP).
    indicator.setContentProtection(true);
    this.indicatorWindow = indicator;

    // Клик по кнопке "Стоп" в индикаторе (или авто-стоп по лимиту) не может
    // остановить запись сам — только уведомляет main через этот колбэк, чтобы main
    // провёл тот же путь завершения (stopRecording -> showPostCaptureChoiceWindow),
    // что и для хоткея/трея. Слушатель живёт ровно столько же, сколько окно.
    this.onStopClicked = (): void => {
      this.logger.debug("WindowsScreenRecording", "user requested stop via indicator button/auto-stop");
      this.userRequestedStopCallback?.();
    };
    ipcMain.on(RECORDING_INDICATOR_CHANNELS.stopClicked, this.onStopClicked);

    const config = await this.configStore.getConfig();
    const initPayload: RecordingIndicatorInitPayload = {
      sourceId: source.id,
      displayBounds: {
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
      },
      displayScaleFactor: display.scaleFactor,
      region: { x: region.x, y: region.y, width: region.width, height: region.height },
      maxDurationSec: config.recordingMaxDurationSec,
    };

    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    if (rendererUrl) {
      void indicator.loadURL(`${rendererUrl}/recording-indicator/index.html`);
    } else {
      void indicator.loadFile(join(__dirname, "../renderer/recording-indicator/index.html"));
    }

    await new Promise<void>((resolve) => {
      indicator.webContents.once("did-finish-load", () => resolve());
    });

    this.logger.debug("WindowsScreenRecording.startIndicatorAndRecording", "sending init payload", {
      maxDurationSec: initPayload.maxDurationSec,
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        removeListeners();
        reject(new Error("Timed out waiting for recording to start"));
      }, START_TIMEOUT_MS);

      const onStarted = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        removeListeners();
        resolve();
      };
      const onFailed = (_event: unknown, message: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        removeListeners();
        reject(new Error(`Recording indicator failed to start: ${message}`));
      };
      const removeListeners = (): void => {
        ipcMain.removeListener(RECORDING_INDICATOR_CHANNELS.started, onStarted);
        ipcMain.removeListener(RECORDING_INDICATOR_CHANNELS.failed, onFailed);
      };

      ipcMain.on(RECORDING_INDICATOR_CHANNELS.started, onStarted);
      ipcMain.on(RECORDING_INDICATOR_CHANNELS.failed, onFailed);

      indicator.webContents.send(RECORDING_INDICATOR_CHANNELS.init, initPayload);
    });
  }

  private closeIndicatorWindow(): void {
    if (this.onStopClicked) {
      ipcMain.removeListener(RECORDING_INDICATOR_CHANNELS.stopClicked, this.onStopClicked);
      this.onStopClicked = null;
    }
    if (this.indicatorWindow && !this.indicatorWindow.isDestroyed()) {
      this.indicatorWindow.close();
    }
    this.indicatorWindow = null;
  }
}
