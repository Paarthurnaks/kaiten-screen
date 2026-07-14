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
    defaultSpaceId: null,
    defaultBoardId: null,
    defaultColumnId: null,
    defaultLaneId: null,
    defaultResponsibleId: null,
    captureHotkey: "CommandOrControl+Shift+K",
    recordHotkey: "CommandOrControl+Shift+R",
    recordingMaxDurationSec: 300,
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

  it("createTask строит ссылку на карточку в формате /space/{spaceId}/boards/card/{id}, если spaceId передан", async () => {
    // Kaiten не возвращает url в ответе на создание карточки, а ссылка вида /cards/{id}
    // (естественное на вид REST-предположение) на самом деле ведёт на 404 — подтверждено
    // вживую на реальной установке Kaiten (см. buildCardUrl в kaiten-http-client.ts).
    // Реальный формат — /space/{spaceId}/boards/card/{id}.
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, { id: 42 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new KaitenHttpClient(createConfigStore(), createSecretStore("secret-key"), createNoopLogger());
    const draft = TaskDraft.create({ title: "Bug", boardId: "b1", laneId: "l1", spaceId: "s1" });

    const result = await client.createTask(draft);

    expect(result.url).toBe("https://mycompany.kaiten.ru/space/s1/boards/card/42");
  });

  it("createTask падает обратно на /cards/{id}, если spaceId не передан", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, { id: 42 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new KaitenHttpClient(createConfigStore(), createSecretStore("secret-key"), createNoopLogger());
    const draft = TaskDraft.create({ title: "Bug", boardId: "b1", laneId: "l1" });

    const result = await client.createTask(draft);

    expect(result.url).toBe("https://mycompany.kaiten.ru/cards/42");
  });

  it("createTask включает column_id/responsible_id/properties, только если они заданы, и приводит values properties к массиву чисел", async () => {
    // Kaiten валидирует values пользовательских полей как "массив integer | null" — независимо
    // от multi_select, подтверждено двумя разными реальными ответами 400 от боевого Kaiten
    // (см. комментарий в kaiten-http-client.ts createTask). Одиночный выбор (скаляр в домене)
    // оборачивается в одноэлементный массив; строковые id приводятся к числам.
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, { id: 42 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new KaitenHttpClient(createConfigStore(), createSecretStore("secret-key"), createNoopLogger());
    const draft = TaskDraft.create({
      title: "Bug",
      boardId: "b1",
      laneId: "l1",
      columnId: "c1",
      responsibleId: "u1",
      properties: { id_1: "11", id_2: ["21", "22"] },
    });

    await client.createTask(draft);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.column_id).toBe("c1");
    expect(body.responsible_id).toBe("u1");
    expect(body.properties).toEqual({ id_1: [11], id_2: [21, 22] });
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
    // Реальный Kaiten API требует PUT для attach-file-to-card (подтверждено curl-запросом
    // к боевому Kaiten) — раньше здесь ошибочно стоял POST.
    expect(init.method).toBe("PUT");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("addCardMember шлёт POST с числовым user_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, { id: 7 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new KaitenHttpClient(createConfigStore(), createSecretStore("secret-key"), createNoopLogger());
    await client.addCardMember("42", "7");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    expect(url).toBe("https://mycompany.kaiten.ru/api/latest/cards/42/members");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ user_id: 7 });
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

  it("listColumns маппит ответ и подставляет boardId", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(200, [{ id: 100, title: "Очередь" }])));

    const client = new KaitenHttpClient(createConfigStore(), createSecretStore("secret-key"), createNoopLogger());
    const columns = await client.listColumns("board-1");

    expect(columns).toEqual([{ id: "100", title: "Очередь", boardId: "board-1" }]);
  });

  it("listUsers маппит full_name в fullName", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse(200, [{ id: 777, full_name: "Максим Шевченко" }]));
    vi.stubGlobal("fetch", fetchMock);

    const client = new KaitenHttpClient(createConfigStore(), createSecretStore("secret-key"), createNoopLogger());
    const users = await client.listUsers();

    expect(users).toEqual([{ id: "777", fullName: "Максим Шевченко" }]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://mycompany.kaiten.ru/api/latest/users?limit=100");
  });

  it("listCustomProperties фильтрует по select/active/show_on_facade и маппит selectValues", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(200, [
          {
            id: 1,
            name: "Окружение",
            type: "select",
            multi_select: false,
            show_on_facade: true,
            condition: "active",
            selectValues: [
              { id: 11, value: "DEV", condition: "active" },
              { id: 12, value: "PROD (архив)", condition: "inactive" },
            ],
          },
          { id: 2, name: "Заказчик", type: "string", multi_select: false, show_on_facade: true, condition: "active" },
          { id: 3, name: "Скрытое", type: "select", multi_select: false, show_on_facade: false, condition: "active" },
        ]),
      ),
    );

    const client = new KaitenHttpClient(createConfigStore(), createSecretStore("secret-key"), createNoopLogger());
    const properties = await client.listCustomProperties();

    expect(properties).toEqual([
      { id: "1", name: "Окружение", multiSelect: false, values: [{ id: "11", label: "DEV" }] },
    ]);
  });

  it("searchCards кодирует query и маппит id/title", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, [{ id: 66730627, title: "Статус класса" }]));
    vi.stubGlobal("fetch", fetchMock);

    const client = new KaitenHttpClient(createConfigStore(), createSecretStore("secret-key"), createNoopLogger());
    const cards = await client.searchCards("Статус класса");

    expect(cards).toEqual([{ id: "66730627", title: "Статус класса" }]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://mycompany.kaiten.ru/api/latest/cards?query=%D0%A1%D1%82%D0%B0%D1%82%D1%83%D1%81%20%D0%BA%D0%BB%D0%B0%D1%81%D1%81%D0%B0&limit=20");
  });
});
