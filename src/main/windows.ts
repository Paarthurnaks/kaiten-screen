import { BrowserWindow } from "electron";
import { join } from "node:path";
import type { Logger } from "../domain/ports/logger";

type RendererPage = "settings" | "task-form";

function loadRendererPage(window: BrowserWindow, page: RendererPage): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void window.loadURL(`${rendererUrl}/${page}/index.html`);
  } else {
    void window.loadFile(join(__dirname, `../renderer/${page}/index.html`));
  }
}

let settingsWindow: BrowserWindow | null = null;
let taskFormWindow: BrowserWindow | null = null;

/** Показывает окно настроек, переиспользуя существующее, если оно уже открыто. */
export function showSettingsWindow(logger: Logger): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 560,
    title: "Kaiten Screen — Настройки",
    webPreferences: { preload: join(__dirname, "../preload/index.mjs") },
  });
  loadRendererPage(settingsWindow, "settings");
  settingsWindow.on("closed", () => {
    logger.debug("Windows.showSettingsWindow", "settings window closed");
    settingsWindow = null;
  });
  logger.debug("Windows.showSettingsWindow", "settings window created");
  return settingsWindow;
}

/** Показывает окно формы задачи, переиспользуя существующее, если оно уже открыто. */
export function showTaskFormWindow(logger: Logger): BrowserWindow {
  if (taskFormWindow && !taskFormWindow.isDestroyed()) {
    taskFormWindow.focus();
    return taskFormWindow;
  }

  taskFormWindow = new BrowserWindow({
    width: 520,
    height: 640,
    title: "Kaiten Screen — Новая задача",
    webPreferences: { preload: join(__dirname, "../preload/index.mjs") },
  });
  loadRendererPage(taskFormWindow, "task-form");
  taskFormWindow.on("closed", () => {
    logger.debug("Windows.showTaskFormWindow", "task form window closed");
    taskFormWindow = null;
  });
  logger.debug("Windows.showTaskFormWindow", "task form window created");
  return taskFormWindow;
}

export function closeTaskFormWindow(): void {
  if (taskFormWindow && !taskFormWindow.isDestroyed()) {
    taskFormWindow.close();
  }
}
