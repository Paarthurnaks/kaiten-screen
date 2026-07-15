import { app, BrowserWindow, clipboard, Menu, nativeImage } from "electron";
import { join } from "node:path";
import { registerCaptureHotkey, unregisterAllHotkeys } from "./hotkeys";
import { createTray } from "./tray";
import { showAnnotationWindow, showPostCaptureChoiceWindow, showSettingsWindow } from "./windows";
import { registerIpcHandlers } from "./ipc-handlers";
import { exportConfigToFile, importConfigFromFile } from "./config-file-transfer";
import { saveRecordingToFile } from "./recording-file-transfer";
import { seedConfigFromProjectFileIfEmpty } from "./project-config-seed";
import { checkForUpdatesManually, setupAutoUpdater } from "./auto-updater";
import { notifyIfVersionChanged } from "./version-notice";
import { createFileLogger } from "../infrastructure/logging/file-logger";
import { JsonConfigStore } from "../infrastructure/config/json-config-store";
import { ElectronSafeStorage } from "../infrastructure/secrets/electron-safe-storage";
import { KaitenHttpClient } from "../infrastructure/kaiten/kaiten-http-client";
import { WindowsScreenCapture } from "../infrastructure/platform/windows/windows-screen-capture";
import { WindowsScreenRecording } from "../infrastructure/platform/windows/windows-screen-recording";
import { CaptureAndCreateTask } from "../application/capture-and-create-task";
import { LoadSettings } from "../application/load-settings";
import { SaveSettings } from "../application/save-settings";
import { ListKaitenOptions } from "../application/list-kaiten-options";
import type { ScreenCaptureProvider } from "../domain/ports/screen-capture-provider";
import type { ScreenRecordingProvider } from "../domain/ports/screen-recording-provider";
import { CaptureRegion } from "../domain/value-objects/capture-region";
import type { CapturedImage } from "../domain/entities/captured-image";
import type { CapturedVideo } from "../domain/entities/captured-video";
import type { AppConfig } from "../domain/ports/config-store";

// Composition root (см. ARCHITECTURE.md): единственное место, где конкретные
// адаптеры создаются и внедряются в use-cases. Domain/application ничего не знают
// об Electron/fs — это единственный модуль, который их связывает.

// Без явного имени Electron определяет его по-разному в зависимости от способа
// запуска: `electron .` (как делает electron-vite dev) читает "name" из package.json
// ("kaiten-screen"), а `electron out/main/index.js` (прямой запуск собранного файла)
// не находит корень приложения и падает на дефолтное "Electron". Это два РАЗНЫХ
// userData-каталога (AppData/Roaming/kaiten-screen и AppData/Roaming/Electron) —
// настройки, сохранённые в одном режиме запуска, не видны в другом. Фиксируем имя
// явно, до первого app.getPath, чтобы userData был одним и тем же всегда.
// В e2e (E2E_TEST_HOOKS=1) — отдельное имя, чтобы прогон тестов не затирал реальные
// настройки/API-ключ разработчика в общем userData (mock-домен/ключ иначе остаются
// там после каждого `npm run test:e2e`).
app.setName(process.env.E2E_TEST_HOOKS === "1" ? "kaiten-screen-e2e" : "kaiten-screen");

// Без явного AppUserModelID, совпадающего с appId из electron-builder.yml, Windows
// иногда молча не показывает toast-уведомления (Notification.show() не бросает ошибку,
// просто ничего не появляется на экране) — обнаружено вживую: автообновление реально
// скачалось и установилось (подтверждено новой функциональностью после перезапуска), но
// ни одно из двух уведомлений (update-available/update-downloaded) не отобразилось.
if (process.platform === "win32") {
  app.setAppUserModelId("com.kaitenscreen.app");
}

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

function createScreenRecordingProvider(): ScreenRecordingProvider {
  // Зеркалирует createScreenCaptureProvider() — единственное место выбора
  // платформенного адаптера записи.
  switch (process.platform) {
    case "win32":
      return new WindowsScreenRecording(configStore, logger);
    default:
      throw new Error(`Screen recording is not implemented for platform "${process.platform}" yet`);
  }
}

const captureProvider = createScreenCaptureProvider();
const screenRecordingProvider = createScreenRecordingProvider();
// Клик по кнопке "Стоп" в индикаторе или авто-стоп по лимиту длительности не
// останавливают запись сами — просят main провести toggleRecording(), тот же путь
// завершения, что и хоткей/трей (см. ScreenRecordingProvider.onUserRequestedStop).
screenRecordingProvider.onUserRequestedStop(() => toggleRecording());

export const captureAndCreateTask = new CaptureAndCreateTask(captureProvider, kaitenClient, logger);
export const loadSettings = new LoadSettings(configStore, secretStore, logger);
export const saveSettings = new SaveSettings(configStore, secretStore, logger);
export const listKaitenOptions = new ListKaitenOptions(kaitenClient, logger);

export type PendingCapture =
  | { kind: "image"; region: CaptureRegion; image: CapturedImage }
  | { kind: "video"; region: CaptureRegion; video: CapturedVideo };

// Последний захваченный регион/вложение (скриншот или запись), ожидающие показа в
// окне выбора действия/форме задачи. Забирается через IPC-хендлер
// app:get-pending-capture (см. ipc-handlers.ts).
let pendingCapture: PendingCapture | null = null;
// true между стартом и остановкой записи — определяет, что делает toggle-хоткей/
// пункт трея записи (старт vs стоп), см. toggleRecording().
let isRecording = false;
// Регион, выбранный при старте текущей записи — нужен на остановке, чтобы окно
// выбора действия могло показать размеры видео (сама запись эти же координаты
// использует внутри себя, см. WindowsScreenRecording).
let lastRecordingRegion: CaptureRegion | null = null;

function getPendingCapture(): PendingCapture | null {
  return pendingCapture;
}

function clearPendingCapture(): void {
  pendingCapture = null;
}

/** Перезаписывает изображение ожидающего скриншота отредактированной версией
 * (с нарисованными аннотациями) — вызывается из IPC-хендлера update-pending-image
 * (см. ipc-handlers.ts), которому renderer шлёт canvas.toDataURL() перед тем, как
 * создать задачу/прикрепить/скопировать в буфер обмена. */
function updatePendingImage(buffer: Buffer): void {
  if (!pendingCapture || pendingCapture.kind !== "image") {
    logger.warn("Main.updatePendingImage", "no pending image to update — ignoring", {
      pendingKind: pendingCapture?.kind ?? null,
    });
    return;
  }
  pendingCapture = { ...pendingCapture, image: { ...pendingCapture.image, buffer } };
  logger.debug("Main.updatePendingImage", "pending image updated with annotations", {
    byteLength: buffer.byteLength,
  });
}

/** Захват региона -> показ формы задачи. Общая точка входа для хоткея и клика в трее
 * (и для e2e-тестов, которым нужно программно запустить сценарий — см. tests/e2e/). */
export async function triggerCaptureFlow(): Promise<void> {
  const result = await captureAndCreateTask.captureStep();
  if (!result) {
    logger.debug("Main.triggerCaptureFlow", "capture returned no result (cancelled)");
    return;
  }
  if (result.action === "clipboard") {
    // Ctrl+C/иконка "Копировать" в оверлее — сразу в буфер обмена, без окна выбора
    // действия (см. shared/capture-overlay-protocol.ts).
    clipboard.writeImage(nativeImage.createFromBuffer(result.image.buffer));
    logger.info("Main.triggerCaptureFlow", "capture copied to clipboard directly from overlay", {
      width: result.region.width,
      height: result.region.height,
    });
    return;
  }
  pendingCapture = { kind: "image", region: result.region, image: result.image };
  logger.info("Main.triggerCaptureFlow", "capture ready, opening annotation screen", {
    width: result.region.width,
    height: result.region.height,
  });
  showAnnotationWindow(logger);
}

/** Старт записи видео выделенной области — общая точка входа для хоткея-тоггла и
 * пункта трея (см. toggleRecording()). Overlay выделения запускает саму запись
 * внутри себя (см. ScreenRecordingProvider.selectRegion), эта функция лишь
 * дожидается результата и переключает isRecording. */
async function triggerRecordFlow(): Promise<void> {
  logger.debug("Main.triggerRecordFlow", "starting recording flow");
  const result = await screenRecordingProvider.selectRegion();
  if (!result) {
    logger.debug("Main.triggerRecordFlow", "recording cancelled or failed to start");
    return;
  }
  isRecording = true;
  lastRecordingRegion = result.region;
  logger.info("Main.triggerRecordFlow", "recording started", {
    width: result.region.width,
    height: result.region.height,
  });
}

/** Остановка текущей записи — по кнопке индикатора (через тот же toggle-хоткей/
 * трей) или программно. Открывает окно выбора действия с готовым видео, как и
 * triggerCaptureFlow делает для скриншота. */
async function triggerStopRecordFlow(): Promise<void> {
  if (!isRecording) {
    logger.debug("Main.triggerStopRecordFlow", "no active recording to stop");
    return;
  }
  logger.debug("Main.triggerStopRecordFlow", "stopping recording");
  const video = await screenRecordingProvider.stopRecording();
  isRecording = false;
  if (!video) {
    logger.warn("Main.triggerStopRecordFlow", "recording stopped without a result");
    return;
  }
  logger.info("Main.triggerStopRecordFlow", "recording finished, opening post-capture choice", {
    byteLength: video.buffer.byteLength,
  });
  // ScreenRecordingProvider.stopRecording() не возвращает регион (только start
  // делает) — берём его из lastRecordingRegion, сохранённого при старте.
  pendingCapture = { kind: "video", region: lastRecordingRegion ?? CaptureRegion.create(0, 0, 1, 1), video };
  lastRecordingRegion = null;
  showPostCaptureChoiceWindow(logger);
}

/** Toggle одним хоткеем/пунктом трея: старт, если не идёт запись, иначе — стоп. */
function toggleRecording(): void {
  if (isRecording) {
    void triggerStopRecordFlow();
  } else {
    void triggerRecordFlow();
  }
}

function reregisterHotkeys(config: Pick<AppConfig, "captureHotkey" | "recordHotkey">): void {
  unregisterAllHotkeys(logger);
  registerCaptureHotkey(config.captureHotkey, () => void triggerCaptureFlow(), logger);
  registerCaptureHotkey(config.recordHotkey, toggleRecording, logger);
}

function applyAutostart(enabled: boolean): void {
  // В dev-режиме (npm run dev) setLoginItemSettings() регистрирует в автозагрузке
  // текущий процесс как есть — electron.exe из node_modules с путём к проекту
  // аргументом. При старте системы эта команда бьётся об отсутствующий dev-сервер
  // ("запусти npm run dev в такой-то папке"). В packaged-сборке (app.isPackaged)
  // process.execPath корректно указывает на установленный .exe, поэтому там это
  // безопасно.
  if (!app.isPackaged) {
    logger.debug("Main.applyAutostart", "skipped — app is not packaged (dev mode)", { enabled });
    return;
  }
  app.setLoginItemSettings({ openAtLogin: enabled });
  logger.info("Main.applyAutostart", "autostart setting applied", { enabled });
}

async function exportProjectConfig(window: BrowserWindow | undefined): Promise<string | null> {
  return exportConfigToFile(window, configStore, secretStore, logger);
}

async function importProjectConfig(window: BrowserWindow | undefined): Promise<boolean> {
  const applied = await importConfigFromFile(window, configStore, secretStore, logger);
  if (applied) {
    const config = await configStore.getConfig();
    reregisterHotkeys(config);
    applyAutostart(config.autostart);
  }
  return applied;
}

function saveRecording(window: BrowserWindow | undefined, video: CapturedVideo): Promise<string | null> {
  return saveRecordingToFile(window, video, logger);
}

// Экспортируется, чтобы e2e-тесты (tests/e2e/) могли дождаться завершения
// регистрации IPC-хендлеров перед взаимодействием с окнами.
export const appReadyPromise: Promise<void> = app.whenReady().then(async () => {
  logger.info("Main.bootstrap", "app ready", { platform: process.platform, version: app.getVersion() });

  // Приложение не использует File/Edit/View и т.п. — это системное меню Electron
  // по умолчанию только занимает место и сбивает с толку.
  Menu.setApplicationMenu(null);

  notifyIfVersionChanged(userDataDir, logger);

  const seeded = await seedConfigFromProjectFileIfEmpty(configStore, secretStore, logger);
  if (seeded) {
    logger.info("Main.bootstrap", "seeded settings from project-level config file (first run)");
  }

  const config = await configStore.getConfig();
  reregisterHotkeys(config);
  applyAutostart(config.autostart);

  createTray(
    {
      onCapture: () => void triggerCaptureFlow(),
      onToggleRecording: toggleRecording,
      onOpenSettings: () => showSettingsWindow(logger),
      onCheckForUpdates: () => checkForUpdatesManually(logger),
    },
    logger,
  );

  setupAutoUpdater(logger);

  registerIpcHandlers({
    captureAndCreateTask,
    loadSettings,
    saveSettings,
    listKaitenOptions,
    getPendingCapture,
    clearPendingCapture,
    updatePendingImage,
    reregisterHotkeys,
    applyAutostart,
    exportProjectConfig,
    importProjectConfig,
    saveRecordingToFile: saveRecording,
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
