import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const encryptString = vi.fn((value: string) => Buffer.from(`enc:${value}`));
const decryptString = vi.fn((buffer: Buffer) => buffer.toString().replace(/^enc:/, ""));
const isEncryptionAvailable = vi.fn(() => true);

vi.mock("electron", () => ({
  safeStorage: {
    encryptString: (value: string) => encryptString(value),
    decryptString: (buffer: Buffer) => decryptString(buffer),
    isEncryptionAvailable: () => isEncryptionAvailable(),
  },
}));

function createNoopLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("ElectronSafeStorage", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kaiten-screen-secrets-"));
    isEncryptionAvailable.mockReturnValue(true);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("возвращает null, если ключ ещё не сохранён", async () => {
    const { ElectronSafeStorage } = await import("../electron-safe-storage");
    const store = new ElectronSafeStorage(dir, createNoopLogger());

    await expect(store.getApiKey()).resolves.toBeNull();
  });

  it("сохраняет и читает ключ через safeStorage", async () => {
    const { ElectronSafeStorage } = await import("../electron-safe-storage");
    const store = new ElectronSafeStorage(dir, createNoopLogger());

    await store.setApiKey("super-secret-key");
    const result = await store.getApiKey();

    expect(result).toBe("super-secret-key");
    expect(encryptString).toHaveBeenCalledWith("super-secret-key");
  });

  it("clearApiKey удаляет сохранённый ключ", async () => {
    const { ElectronSafeStorage } = await import("../electron-safe-storage");
    const store = new ElectronSafeStorage(dir, createNoopLogger());

    await store.setApiKey("super-secret-key");
    await store.clearApiKey();

    await expect(store.getApiKey()).resolves.toBeNull();
  });

  it("бросает ошибку, если OS-шифрование недоступно", async () => {
    isEncryptionAvailable.mockReturnValue(false);
    const { ElectronSafeStorage } = await import("../electron-safe-storage");
    const store = new ElectronSafeStorage(dir, createNoopLogger());

    await expect(store.setApiKey("key")).rejects.toThrow(/not available/);
  });
});
