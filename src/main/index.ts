import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { createFileLogger } from "../infrastructure/logging/file-logger";

const logger = createFileLogger(join(app.getPath("userData"), "logs"));

// Временная точка входа для проверки сборки electron-vite/electron-builder.
// Реальная сборка приложения (composition root, трей, хоткеи, окна) —
// см. задачи "Main: composition root", "Main: трей-иконка и меню",
// "Main: глобальные хоткеи", "Main: управление окнами".

function createPlaceholderWindow(): void {
  const window = new BrowserWindow({
    width: 480,
    height: 360,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/settings/index.html`);
  } else {
    void window.loadFile(join(__dirname, "../renderer/settings/index.html"));
  }
}

app.whenReady().then(() => {
  logger.info("Main.bootstrap", "app ready", { platform: process.platform, version: app.getVersion() });
  createPlaceholderWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPlaceholderWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
