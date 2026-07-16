import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockNotificationRecord {
  title: string;
  body: string;
  show: ReturnType<typeof vi.fn>;
}

const mockNotificationInstances: MockNotificationRecord[] = [];
const mockAutoUpdater = new EventEmitter() as EventEmitter & {
  checkForUpdates: ReturnType<typeof vi.fn>;
};
mockAutoUpdater.checkForUpdates = vi.fn().mockResolvedValue(undefined);

vi.mock("electron", () => ({
  app: { isPackaged: true },
  Notification: class {
    static isSupported(): boolean {
      return true;
    }
    show = vi.fn();
    constructor(opts: { title: string; body: string }) {
      mockNotificationInstances.push({ ...opts, show: this.show });
    }
    on(): void {
      // клик по уведомлению не проверяется в этих тестах
    }
  },
}));

vi.mock("electron-updater", () => ({
  default: { autoUpdater: mockAutoUpdater },
}));

function createNoopLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("checkForUpdatesManually — обратная связь при ручной проверке", () => {
  beforeEach(() => {
    mockAutoUpdater.removeAllListeners();
    mockNotificationInstances.length = 0;
    vi.clearAllMocks();
  });

  it("показывает уведомление и логирует, когда обновлений нет", async () => {
    const { checkForUpdatesManually } = await import("../auto-updater");
    const logger = createNoopLogger();

    checkForUpdatesManually(logger);
    mockAutoUpdater.emit("update-not-available");

    expect(logger.debug).toHaveBeenCalledWith("AutoUpdater.manualCheck", "no update available (manual check)");
    expect(mockNotificationInstances).toHaveLength(1);
    expect(mockNotificationInstances[0].body).toBe("У вас установлена последняя версия.");
    expect(mockNotificationInstances[0].show).toHaveBeenCalledOnce();
  });

  it("показывает уведомление и логирует ошибку при сбое проверки", async () => {
    const { checkForUpdatesManually } = await import("../auto-updater");
    const logger = createNoopLogger();

    checkForUpdatesManually(logger);
    mockAutoUpdater.emit("error", new Error("network down"));

    expect(logger.error).toHaveBeenCalledWith("AutoUpdater.manualCheck", "update check failed (manual check)", {
      error: "Error: network down",
    });
    expect(mockNotificationInstances).toHaveLength(1);
    expect(mockNotificationInstances[0].body).toBe("Не удалось проверить обновления. Попробуйте позже.");
  });

  it("снимает одноразовые слушатели после срабатывания — второй вызов не задваивает уведомления", async () => {
    const { checkForUpdatesManually } = await import("../auto-updater");
    const logger = createNoopLogger();

    // Первый вызов резолвится через "нет обновлений" — попутный once-слушатель на
    // "error" должен быть снят через cleanup(), иначе он повиснет и сработает
    // повторно при следующем вызове.
    checkForUpdatesManually(logger);
    mockAutoUpdater.emit("update-not-available");

    checkForUpdatesManually(logger);
    mockAutoUpdater.emit("error", new Error("network down"));

    expect(logger.error).toHaveBeenCalledTimes(1);
    const errorNotifications = mockNotificationInstances.filter(
      (n) => n.body === "Не удалось проверить обновления. Попробуйте позже.",
    );
    expect(errorNotifications).toHaveLength(1);
  });
});
