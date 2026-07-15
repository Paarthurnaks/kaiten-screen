import type {
  KaitenClient,
  KaitenSpace,
  KaitenBoard,
  KaitenColumn,
  KaitenLane,
  KaitenUser,
  KaitenCustomProperty,
  KaitenSearchCard,
  KaitenCreatedTask,
} from "../../domain/ports/kaiten-client";
import type { TaskDraft } from "../../domain/entities/task-draft";
import type { Attachment } from "../../domain/entities/attachment";
import type { ConfigStore } from "../../domain/ports/config-store";
import type { SecretStore } from "../../domain/ports/secret-store";
import type { Logger } from "../../domain/ports/logger";

// Схема эндпоинтов и полей подтверждена реальными ответами боевого Kaiten
// (см. examples.md в корне репозитория за подробностями и примерами curl/ответов).
const API_PREFIX = "/api/latest";
const ENDPOINTS = {
  createCard: () => `${API_PREFIX}/cards`,
  attachFile: (cardId: string) => `${API_PREFIX}/cards/${cardId}/files`,
  addCardMember: (cardId: string) => `${API_PREFIX}/cards/${cardId}/members`,
  listSpaces: () => `${API_PREFIX}/spaces`,
  listBoards: (spaceId: string) => `${API_PREFIX}/spaces/${spaceId}/boards`,
  listColumns: (boardId: string) => `${API_PREFIX}/boards/${boardId}/columns`,
  listLanes: (boardId: string) => `${API_PREFIX}/boards/${boardId}/lanes`,
  listUsers: () => `${API_PREFIX}/users?limit=100`,
  listCustomProperties: () => `${API_PREFIX}/company/custom-properties?include_values=true`,
  searchCards: (query: string) => `${API_PREFIX}/cards?query=${encodeURIComponent(query)}&limit=20`,
};

interface RawUser {
  id: number | string;
  full_name: string;
}

interface RawCustomPropertyValue {
  id: number | string;
  value: string;
  condition: string;
}

interface RawCustomProperty {
  id: number | string;
  name: string;
  type: string;
  multi_select: boolean;
  show_on_facade: boolean;
  condition: string;
  selectValues?: RawCustomPropertyValue[];
}

function normalizeBaseUrl(domain: string): string {
  const withProtocol = /^https?:\/\//.test(domain) ? domain : `https://${domain}`;
  return withProtocol.replace(/\/+$/, "");
}

// Kaiten не возвращает ссылку на карточку в ответе на её создание — собираем сами.
// Реальный формат ссылки в веб-интерфейсе Kaiten — `/space/{spaceId}/boards/card/{cardId}`,
// НЕ `/cards/{cardId}` (последнее выглядит как более "REST-ный" путь, но ведёт на 404 —
// подтверждено вживую на реальной установке Kaiten). Без spaceId (например, если форма
// отправлена без выбора пространства) fallback на /cards/{id} лучше, чем ничего, хотя он
// тоже 404 — по крайней мере содержит id карточки.
function buildCardUrl(base: string, spaceId: string | undefined, cardId: string): string {
  return spaceId ? `${base}/space/${spaceId}/boards/card/${cardId}` : `${base}/cards/${cardId}`;
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<no response body>";
  }
}

function attachmentFileName(attachment: Attachment): string {
  return attachment.mimeType === "video/webm" ? "recording.webm" : "screenshot.png";
}

/** KaitenHttpClient (implements KaitenClient) — HTTP-адаптер поверх Kaiten REST API. */
export class KaitenHttpClient implements KaitenClient {
  constructor(
    private readonly configStore: ConfigStore,
    private readonly secretStore: SecretStore,
    private readonly logger: Logger,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const config = await this.configStore.getConfig();
    const apiKey = await this.secretStore.getApiKey();
    if (!apiKey) {
      throw new Error("Kaiten API key is not configured");
    }

    const url = `${normalizeBaseUrl(config.kaitenDomain)}${path}`;
    this.logger.debug("KaitenHttpClient.request", `${method} ${path}`);

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      this.logger.error("KaitenHttpClient.request", `${method} ${path} failed`, {
        status: response.status,
        body: errorBody,
      });
      throw new Error(`Kaiten API ${method} ${path} failed with status ${response.status}: ${errorBody}`);
    }

    this.logger.info("KaitenHttpClient.request", `${method} ${path} succeeded`, { status: response.status });
    return (await response.json()) as T;
  }

  async createTask(draft: TaskDraft): Promise<KaitenCreatedTask> {
    const body: Record<string, unknown> = {
      title: draft.title,
      description: draft.description,
      board_id: draft.boardId,
      lane_id: draft.laneId,
    };
    if (draft.columnId) body.column_id = draft.columnId;
    if (draft.responsibleId) body.responsible_id = draft.responsibleId;
    if (Object.keys(draft.properties).length > 0) {
      // Kaiten валидирует значения select-полей как "массив integer | null" — подтверждено
      // двумя разными реальными ответами 400 от боевого Kaiten: для одного поля с
      // multi_select=true отклонялся массив строк ("[0] should be integer"), для другого
      // с multi_select=false отклонялось скалярное число ("should be array"). Т.е. формат
      // на проводе — всегда массив чисел, независимо от multi_select (тот влияет только на
      // то, сколько значений можно выбрать в UI Kaiten, не на формат запроса). Домен/UI
      // хранят одиночный выбор скаляром — оборачиваем в массив здесь, на границе с HTTP.
      body.properties = Object.fromEntries(
        Object.entries(draft.properties).map(([key, value]) => [
          key,
          (Array.isArray(value) ? value : [value]).map(Number),
        ]),
      );
    }

    const responseBody = await this.request<{ id: number | string; url?: string }>(
      "POST",
      ENDPOINTS.createCard(),
      body,
    );
    const base = normalizeBaseUrl((await this.configStore.getConfig()).kaitenDomain);
    return {
      id: String(responseBody.id),
      url: responseBody.url ?? buildCardUrl(base, draft.spaceId, String(responseBody.id)),
    };
  }

  async attachFile(taskId: string, attachment: Attachment): Promise<void> {
    const config = await this.configStore.getConfig();
    const apiKey = await this.secretStore.getApiKey();
    if (!apiKey) {
      throw new Error("Kaiten API key is not configured");
    }

    const url = `${normalizeBaseUrl(config.kaitenDomain)}${ENDPOINTS.attachFile(taskId)}`;
    this.logger.debug("KaitenHttpClient.attachFile", `PUT ${ENDPOINTS.attachFile(taskId)}`, {
      taskId,
      mimeType: attachment.mimeType,
    });

    const formData = new FormData();
    const fileName = attachmentFileName(attachment);
    formData.append(
      "file",
      new Blob([Uint8Array.from(attachment.buffer)], { type: attachment.mimeType }),
      fileName,
    );

    const response = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      this.logger.error("KaitenHttpClient.attachFile", "upload failed", { taskId, status: response.status, body: errorBody });
      throw new Error(`Kaiten API attachFile failed with status ${response.status}: ${errorBody}`);
    }

    this.logger.info("KaitenHttpClient.attachFile", "upload succeeded", { taskId });
  }

  async addCardMember(taskId: string, userId: string): Promise<void> {
    // user_id, как и properties, должен быть настоящим числом в JSON — строка отклоняется
    // валидацией Kaiten (см. комментарий про properties в createTask выше).
    await this.request("POST", ENDPOINTS.addCardMember(taskId), { user_id: Number(userId) });
  }

  async listSpaces(): Promise<KaitenSpace[]> {
    const items = await this.request<Array<{ id: number | string; title: string }>>("GET", ENDPOINTS.listSpaces());
    return items.map((item) => ({ id: String(item.id), title: item.title }));
  }

  async listBoards(spaceId: string): Promise<KaitenBoard[]> {
    const items = await this.request<Array<{ id: number | string; title: string }>>(
      "GET",
      ENDPOINTS.listBoards(spaceId),
    );
    return items.map((item) => ({ id: String(item.id), title: item.title, spaceId }));
  }

  async listColumns(boardId: string): Promise<KaitenColumn[]> {
    const items = await this.request<Array<{ id: number | string; title: string }>>(
      "GET",
      ENDPOINTS.listColumns(boardId),
    );
    return items.map((item) => ({ id: String(item.id), title: item.title, boardId }));
  }

  async listLanes(boardId: string): Promise<KaitenLane[]> {
    const items = await this.request<Array<{ id: number | string; title: string }>>(
      "GET",
      ENDPOINTS.listLanes(boardId),
    );
    return items.map((item) => ({ id: String(item.id), title: item.title, boardId }));
  }

  async listUsers(): Promise<KaitenUser[]> {
    const items = await this.request<RawUser[]>("GET", ENDPOINTS.listUsers());
    return items.map((item) => ({ id: String(item.id), fullName: item.full_name }));
  }

  async listCustomProperties(): Promise<KaitenCustomProperty[]> {
    const items = await this.request<RawCustomProperty[]>("GET", ENDPOINTS.listCustomProperties());
    return items
      .filter((item) => item.type === "select" && item.condition === "active" && item.show_on_facade)
      .map((item) => ({
        id: String(item.id),
        name: item.name,
        multiSelect: item.multi_select,
        values: (item.selectValues ?? [])
          .filter((value) => value.condition === "active")
          .map((value) => ({ id: String(value.id), label: value.value })),
      }));
  }

  async searchCards(query: string): Promise<KaitenSearchCard[]> {
    const items = await this.request<Array<{ id: number | string; title: string }>>(
      "GET",
      ENDPOINTS.searchCards(query),
    );
    return items.map((item) => ({ id: String(item.id), title: item.title }));
  }
}
