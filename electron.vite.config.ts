import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
        output: {
          // Явно CJS (.cjs), а не ESM — sandboxed-preload в Electron не поддерживает
          // ESM-скрипты, contextBridge.exposeInMainWorld молча не срабатывает иначе.
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    // localhost на этой машине резолвится в IPv6 (::1) быстрее/раньше, чем в 127.0.0.1,
    // а Electron/Chromium подключается по IPv4 — без явного host dev-сервер слушал
    // только IPv6 и все окна падали с ERR_CONNECTION_REFUSED.
    server: { host: "127.0.0.1" },
    build: {
      rollupOptions: {
        input: {
          captureOverlay: resolve(__dirname, "src/renderer/capture-overlay/index.html"),
          taskForm: resolve(__dirname, "src/renderer/task-form/index.html"),
          settings: resolve(__dirname, "src/renderer/settings/index.html"),
          postCaptureChoice: resolve(__dirname, "src/renderer/post-capture-choice/index.html"),
          attachTask: resolve(__dirname, "src/renderer/attach-task/index.html"),
          recordingIndicator: resolve(__dirname, "src/renderer/recording-indicator/index.html"),
          recordingFrame: resolve(__dirname, "src/renderer/recording-frame/index.html"),
        },
      },
    },
    plugins: [react()],
  },
});
