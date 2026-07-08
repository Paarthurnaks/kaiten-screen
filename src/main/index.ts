import { app } from "electron";
import { join } from "node:path";
import { registerCaptureHotkey, unregisterAllHotkeys } from "./hotkeys";
import { createTray } from "./tray";
import { showSettingsWindow, showTaskFormWindow } from "./windows";
import { registerIpcHandlers } from "./ipc-handlers";
import { createFileLogger } from "../infrastructure/logging/file-logger";
import { JsonConfigStore } from "../infrastructure/config/json-config-store";
import { ElectronSafeStorage } from "../infrastructure/secrets/electron-safe-storage";
import { KaitenHttpClient } from "../infrastructure/kaiten/kaiten-http-client";
import { WindowsScreenCapture } from "../infrastructure/platform/windows/windows-screen-capture";
import { CaptureAndCreateTask } from "../application/capture-and-create-task";
import { LoadSettings } from "../application/load-settings";
import { SaveSettings } from "../application/save-settings";
import { ListKaitenOptions } from "../application/list-kaiten-options";
import type { ScreenCaptureProvider } from "../domain/ports/screen-capture-provider";
import type { CaptureRegion } from "../domain/value-objects/capture-region";
import type { CapturedImage } from "../domain/entities/captured-image";

// Composition root (см. ARCHITECTURE.md): единственное место, где конкретные
// адаптеры создаются и внедряются в use-cases. Domain/application ничего не знают
// об Electron/fs — это единственный модуль, который их связывает.

const userDataDir = app.getPath("userData");
const logger = createFileLogger(join(userDataDir, "logs"));

const configStore = new JsonConfigStore(userDataDir, logger);
const secretStore = new ElectronSafeStorage(userDataDir, logger);
const kaitenClient = new KaitenHttpClient(configStore, secretStore, logger);

function createScreenCaptureProvider(): ScreenCaptureProvider {
  // Единственное место выбора платформенного адаптера захвата. Поддержка macOS
  // добавится здесь же новым case — без изменений в domain/application/renderer.
  switch (process.platform) {
    case "win32":
      return new WindowsScreenCapture(logger);
    default:
      throw new Error(`Screen capture is not implemented for platform "${process.platform}" yet`);
  }
}

const captureProvider = createScreenCaptureProvider();

export const captureAndCreateTask = new CaptureAndCreateTask(captureProvider, kaitenClient, logger);
export const loadSettings = new LoadSettings(configStore, secretStore, logger);
export const saveSettings = new SaveSettings(configStore, secretStore, logger);
export const listKaitenOptions = new ListKaitenOptions(kaitenClient, logger);

// Последний захваченный регион/изображение, ожидающие показа в форме задачи.
// Форма забирает их через IPC-хендлер app:get-pending-capture (см. ipc-handlers.ts).
let pendingCapture: { region: CaptureRegion; image: CapturedImage } | null = null;

function getPendingCapture(): { region: CaptureRegion; image: CapturedImage } | null {
  return pendingCapture;
}

function clearPendingCapture(): void {
  pendingCapture = null;
}

async function handleCaptureHotkeyTriggered(): Promise<void> {
  const result = await captureAndCreateTask.captureStep();
  if (!result) {
    logger.debug("Main.handleCaptureHotkeyTriggered", "capture returned no result (cancelled)");
    return;
  }
  pendingCapture = result;
  logger.info("Main.handleCaptureHotkeyTriggered", "capture ready, opening task form", {
    width: result.region.width,
    height: result.region.height,
  });
  showTaskFormWindow(logger);
}

function reregisterCaptureHotkey(accelerator: string): void {
  unregisterAllHotkeys(logger);
  registerCaptureHotkey(accelerator, () => void handleCaptureHotkeyTriggered(), logger);
}

app.whenReady().then(async () => {
  logger.info("Main.bootstrap", "app ready", { platform: process.platform, version: app.getVersion() });

  const config = await configStore.getConfig();
  reregisterCaptureHotkey(config.captureHotkey);

  createTray(
    {
      onCapture: () => void handleCaptureHotkeyTriggered(),
      onOpenSettings: () => showSettingsWindow(logger),
    },
    logger,
  );

  registerIpcHandlers({
    captureAndCreateTask,
    loadSettings,
    saveSettings,
    listKaitenOptions,
    getPendingCapture,
    clearPendingCapture,
    reregisterCaptureHotkey,
    logger,
  });
});

app.on("will-quit", () => {
  unregisterAllHotkeys(logger);
});

app.on("window-all-closed", () => {
  // Временное поведение до задачи "Автозапуск и поведение свернуть в трей" — там
  // приложение будет жить в трее вместо завершения процесса при закрытии окон.
  if (process.platform !== "darwin") {
    app.quit();
  }
});
