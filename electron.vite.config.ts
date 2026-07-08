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
    build: {
      rollupOptions: {
        input: {
          captureOverlay: resolve(__dirname, "src/renderer/capture-overlay/index.html"),
          taskForm: resolve(__dirname, "src/renderer/task-form/index.html"),
          settings: resolve(__dirname, "src/renderer/settings/index.html"),
        },
      },
    },
    plugins: [react()],
  },
});
