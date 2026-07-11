import { BrowserWindow } from "electron";
import { join } from "node:path";
import type { Logger } from "../domain/ports/logger";
import { createAppIcon } from "./app-icon";

type RendererPage = "settings" | "task-form" | "post-capture-choice" | "attach-task";

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
let postCaptureChoiceWindow: BrowserWindow | null = null;
let attachTaskWindow: BrowserWindow | null = null;

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
    icon: createAppIcon(),
    webPreferences: { preload: join(__dirname, "../preload/index.cjs") },
  });
  loadRendererPage(settingsWindow, "settings");
  settingsWindow.on("closed", () => {
    logger.debug("Windows.showSettingsWindow", "settings window closed");
    settingsWindow = null;
  });
  logger.debug("Windows.showSettingsWindow", "settings window created");
  return settingsWindow;
}

/** Показывает окно формы задачи, переиспользуя существующее, если оно уже открыто.
 * Каждый раз перезагружает содержимое — иначе окно, оставленное открытым с прошлого
 * захвата, показывает свой старый React-стейт (заполненную форму/экран успеха) вместо
 * чистой формы для нового pendingCapture. */
export function showTaskFormWindow(logger: Logger): BrowserWindow {
  if (taskFormWindow && !taskFormWindow.isDestroyed()) {
    loadRendererPage(taskFormWindow, "task-form");
    taskFormWindow.focus();
    return taskFormWindow;
  }

  taskFormWindow = new BrowserWindow({
    width: 520,
    height: 640,
    title: "Kaiten Screen — Новая задача",
    icon: createAppIcon(),
    webPreferences: { preload: join(__dirname, "../preload/index.cjs") },
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

/** Показывает окно выбора действия после захвата, переиспользуя существующее.
 * Перезагружает содержимое при переиспользовании — см. комментарий в showTaskFormWindow. */
export function showPostCaptureChoiceWindow(logger: Logger): BrowserWindow {
  if (postCaptureChoiceWindow && !postCaptureChoiceWindow.isDestroyed()) {
    loadRendererPage(postCaptureChoiceWindow, "post-capture-choice");
    postCaptureChoiceWindow.focus();
    return postCaptureChoiceWindow;
  }

  postCaptureChoiceWindow = new BrowserWindow({
    width: 420,
    height: 600,
    title: "Kaiten Screen — Скриншот готов",
    icon: createAppIcon(),
    webPreferences: { preload: join(__dirname, "../preload/index.cjs") },
  });
  loadRendererPage(postCaptureChoiceWindow, "post-capture-choice");
  postCaptureChoiceWindow.on("closed", () => {
    logger.debug("Windows.showPostCaptureChoiceWindow", "post-capture choice window closed");
    postCaptureChoiceWindow = null;
  });
  logger.debug("Windows.showPostCaptureChoiceWindow", "post-capture choice window created");
  return postCaptureChoiceWindow;
}

/** Показывает окно поиска и прикрепления к существующей задаче, переиспользуя существующее.
 * Перезагружает содержимое при переиспользовании — см. комментарий в showTaskFormWindow.
 * Без этого повторный сценарий "прикрепить к существующей" после успешного прикрепления
 * в прошлый раз показывал застрявший экран "Скриншот прикреплён" вместо чистого поиска. */
export function showAttachTaskWindow(logger: Logger): BrowserWindow {
  if (attachTaskWindow && !attachTaskWindow.isDestroyed()) {
    loadRendererPage(attachTaskWindow, "attach-task");
    attachTaskWindow.focus();
    return attachTaskWindow;
  }

  attachTaskWindow = new BrowserWindow({
    width: 480,
    height: 680,
    title: "Kaiten Screen — Прикрепить к задаче",
    icon: createAppIcon(),
    webPreferences: { preload: join(__dirname, "../preload/index.cjs") },
  });
  loadRendererPage(attachTaskWindow, "attach-task");
  attachTaskWindow.on("closed", () => {
    logger.debug("Windows.showAttachTaskWindow", "attach task window closed");
    attachTaskWindow = null;
  });
  logger.debug("Windows.showAttachTaskWindow", "attach task window created");
  return attachTaskWindow;
}
