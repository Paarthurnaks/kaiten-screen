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

/** Захват региона -> показ формы задачи. Общая точка входа для хоткея и клика в трее
 * (и для e2e-тестов, которым нужно программно запустить сценарий — см. tests/e2e/). */
export async function triggerCaptureFlow(): Promise<void> {
  const result = await captureAndCreateTask.captureStep();
  if (!result) {
    logger.debug("Main.triggerCaptureFlow", "capture returned no result (cancelled)");
    return;
  }
  pendingCapture = result;
  logger.info("Main.triggerCaptureFlow", "capture ready, opening task form", {
    width: result.region.width,
    height: result.region.height,
  });
  showTaskFormWindow(logger);
}

function reregisterCaptureHotkey(accelerator: string): void {
  unregisterAllHotkeys(logger);
  registerCaptureHotkey(accelerator, () => void triggerCaptureFlow(), logger);
}

function applyAutostart(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled });
  logger.info("Main.applyAutostart", "autostart setting applied", { enabled });
}

// Экспортируется, чтобы e2e-тесты (tests/e2e/) могли дождаться завершения
// регистрации IPC-хендлеров перед взаимодействием с окнами.
export const appReadyPromise: Promise<void> = app.whenReady().then(async () => {
  logger.info("Main.bootstrap", "app ready", { platform: process.platform, version: app.getVersion() });

  const config = await configStore.getConfig();
  reregisterCaptureHotkey(config.captureHotkey);
  applyAutostart(config.autostart);

  createTray(
    {
      onCapture: () => void triggerCaptureFlow(),
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
    applyAutostart,
    logger,
  });
});

app.on("will-quit", () => {
  unregisterAllHotkeys(logger);
});

// Приложение живёт в трее — закрытие окна формы/настроек не завершает процесс.
// Выход — только через пункт "Выход" в трее (см. main/tray.ts).
app.on("window-all-closed", () => {
  logger.debug("Main.window-all-closed", "all windows closed, staying in tray");
});

declare global {
  // eslint-disable-next-line no-var
  var __kaitenScreenE2e:
    | { appReadyPromise: Promise<void>; saveSettings: SaveSettings; triggerCaptureFlow: () => Promise<void> }
    | undefined;
}

// Playwright's electronApp.evaluate() не поддерживает require()/import() внутри eval —
// поэтому нужные для e2e-тестов хуки выставляются через globalThis, а не через обычный
// export+import модуля. Включается только при явном E2E_TEST_HOOKS=1 (см. tests/e2e/).
if (process.env.E2E_TEST_HOOKS === "1") {
  globalThis.__kaitenScreenE2e = { appReadyPromise, saveSettings, triggerCaptureFlow };
}
