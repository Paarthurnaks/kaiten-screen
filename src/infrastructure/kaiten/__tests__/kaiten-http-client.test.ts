import { beforeEach, describe, expect, it, vi } from "vitest";
import { KaitenHttpClient } from "../kaiten-http-client";
import type { AppConfig, ConfigStore } from "../../../domain/ports/config-store";
import type { SecretStore } from "../../../domain/ports/secret-store";
import type { Logger } from "../../../domain/ports/logger";
import { TaskDraft } from "../../../domain/entities/task-draft";

function createNoopLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function createConfigStore(overrides: Partial<AppConfig> = {}): ConfigStore {
  const config: AppConfig = {
    kaitenDomain: "mycompany.kaiten.ru",
    defaultBoardId: null,
    defaultLaneId: null,
    captureHotkey: "CommandOrControl+Shift+K",
    autostart: false,
    ...overrides,
  };
  return { getConfig: vi.fn().mockResolvedValue(config), setConfig: vi.fn() };
}

function createSecretStore(apiKey: string | null): SecretStore {
  return { getApiKey: vi.fn().mockResolvedValue(apiKey), setApiKey: vi.fn(), clearApiKey: vi.fn() };
}

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe("KaitenHttpClient", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("createTask отправляет корректный запрос и маппит ответ", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, { id: 42 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new KaitenHttpClient(createConfigStore(), createSecretStore("secret-key"), createNoopLogger());
    const draft = TaskDraft.create({ title: "Bug", boardId: "b1", laneId: "l1" });

    const result = await client.createTask(draft);

    expect(result.id).toBe("42");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://mycompany.kaiten.ru/api/latest/cards");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer secret-key");
  });

  it("createTask бросает ошибку при не-2xx ответе", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(401, { message: "unauthorized" })));

    const client = new KaitenHttpClient(createConfigStore(), createSecretStore("bad-key"), createNoopLogger());
    const draft = TaskDraft.create({ title: "Bug", boardId: "b1", laneId: "l1" });

    await expect(client.createTask(draft)).rejects.toThrow(/401/);
  });

  it("createTask бросает ошибку, если API-ключ не настроен, и не вызывает fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new KaitenHttpClient(createConfigStore(), createSecretStore(null), createNoopLogger());
    const draft = TaskDraft.create({ title: "Bug", boardId: "b1", laneId: "l1" });

    await expect(client.createTask(draft)).rejects.toThrow(/API key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("attachFile отправляет multipart-запрос с FormData", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = new KaitenHttpClient(createConfigStore(), createSecretStore("secret-key"), createNoopLogger());

    await client.attachFile("42", { buffer: Buffer.from("fake-png"), mimeType: "image/png" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://mycompany.kaiten.ru/api/latest/cards/42/files");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("attachFile бросает ошибку при не-2xx ответе", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(500, { message: "server error" })));

    const client = new KaitenHttpClient(createConfigStore(), createSecretStore("secret-key"), createNoopLogger());

    await expect(
      client.attachFile("42", { buffer: Buffer.from("fake-png"), mimeType: "image/png" }),
    ).rejects.toThrow(/500/);
  });

  it("listBoards маппит ответ и подставляет spaceId", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(200, [{ id: 1, title: "Board A" }])));

    const client = new KaitenHttpClient(createConfigStore(), createSecretStore("secret-key"), createNoopLogger());
    const boards = await client.listBoards("space-1");

    expect(boards).toEqual([{ id: "1", title: "Board A", spaceId: "space-1" }]);
  });
});
