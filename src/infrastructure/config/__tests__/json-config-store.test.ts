import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonConfigStore } from "../json-config-store";
import { DEFAULT_APP_CONFIG } from "../../../domain/ports/config-store";

function createNoopLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("JsonConfigStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kaiten-screen-config-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("возвращает дефолтный конфиг, если файл ещё не создан", async () => {
    const store = new JsonConfigStore(dir, createNoopLogger());

    const config = await store.getConfig();

    expect(config).toEqual(DEFAULT_APP_CONFIG);
  });

  it("сохраняет частичный патч и возвращает объединённый конфиг", async () => {
    const store = new JsonConfigStore(dir, createNoopLogger());

    await store.setConfig({ kaitenDomain: "mycompany.kaiten.ru", autostart: true });
    const config = await store.getConfig();

    expect(config).toEqual({ ...DEFAULT_APP_CONFIG, kaitenDomain: "mycompany.kaiten.ru", autostart: true });
  });

  it("падает обратно на дефолты при повреждённом JSON-файле", async () => {
    const store = new JsonConfigStore(dir, createNoopLogger());
    writeFileSync(join(dir, "config.json"), "{ not valid json", "utf8");

    const config = await store.getConfig();

    expect(config).toEqual(DEFAULT_APP_CONFIG);
  });
});
