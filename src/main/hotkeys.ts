import { globalShortcut } from "electron";
import type { Logger } from "../domain/ports/logger";

/**
 * Регистрирует глобальный хоткей запуска захвата. Ничего не знает про use-cases —
 * просто вызывает переданный callback, когда комбинация сработала. Реальный флоу
 * (что делать после срабатывания) собирается в composition root (main/index.ts).
 */
export function registerCaptureHotkey(accelerator: string, onTrigger: () => void, logger: Logger): boolean {
  const success = globalShortcut.register(accelerator, () => {
    logger.debug("Hotkeys.captureHotkey", "hotkey triggered", { accelerator });
    onTrigger();
  });

  if (!success) {
    logger.warn(
      "Hotkeys.captureHotkey",
      "failed to register hotkey — possibly already in use by another application",
      { accelerator },
    );
  } else {
    logger.info("Hotkeys.captureHotkey", "hotkey registered", { accelerator });
  }

  return success;
}

export function unregisterAllHotkeys(logger: Logger): void {
  globalShortcut.unregisterAll();
  logger.debug("Hotkeys.unregisterAllHotkeys", "all hotkeys unregistered");
}
