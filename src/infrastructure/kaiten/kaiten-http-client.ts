import type {
  KaitenClient,
  KaitenSpace,
  KaitenBoard,
  KaitenLane,
  KaitenCreatedTask,
} from "../../domain/ports/kaiten-client";
import type { TaskDraft } from "../../domain/entities/task-draft";
import type { CapturedImage } from "../../domain/entities/captured-image";
import type { ConfigStore } from "../../domain/ports/config-store";
import type { SecretStore } from "../../domain/ports/secret-store";
import type { Logger } from "../../domain/ports/logger";

// TODO(kaiten-api): точная схема эндпоинтов/полей ещё не подтверждена владельцем продукта.
// Пути ниже — рабочее предположение по типовому REST API Kaiten (`/api/latest/...`).
// Как только придут реальные примеры запросов/ответов — поменять только константы и
// map*-функции ниже, остальной класс (авторизация, обработка ошибок, логирование) менять не нужно.
const API_PREFIX = "/api/latest";
const ENDPOINTS = {
  createCard: () => `${API_PREFIX}/cards`,
  attachFile: (cardId: string) => `${API_PREFIX}/cards/${cardId}/files`,
  listSpaces: () => `${API_PREFIX}/spaces`,
  listBoards: (spaceId: string) => `${API_PREFIX}/spaces/${spaceId}/boards`,
  listLanes: (boardId: string) => `${API_PREFIX}/boards/${boardId}/lanes`,
};

function normalizeBaseUrl(domain: string): string {
  const withProtocol = /^https?:\/\//.test(domain) ? domain : `https://${domain}`;
  return withProtocol.replace(/\/+$/, "");
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<no response body>";
  }
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
    // TODO(kaiten-api): подтвердить точные имена полей запроса (title/description/board_id/column_id?).
    const responseBody = await this.request<{ id: number | string; url?: string }>(
      "POST",
      ENDPOINTS.createCard(),
      {
        title: draft.title,
        description: draft.description,
        board_id: draft.boardId,
        lane_id: draft.laneId,
        ...draft.additionalFields,
      },
    );
    return {
      id: String(responseBody.id),
      url: responseBody.url ?? `${normalizeBaseUrl((await this.configStore.getConfig()).kaitenDomain)}/cards/${responseBody.id}`,
    };
  }

  async attachFile(taskId: string, image: CapturedImage): Promise<void> {
    const config = await this.configStore.getConfig();
    const apiKey = await this.secretStore.getApiKey();
    if (!apiKey) {
      throw new Error("Kaiten API key is not configured");
    }

    const url = `${normalizeBaseUrl(config.kaitenDomain)}${ENDPOINTS.attachFile(taskId)}`;
    this.logger.debug("KaitenHttpClient.attachFile", `POST ${ENDPOINTS.attachFile(taskId)}`, { taskId });

    const formData = new FormData();
    formData.append("file", new Blob([Uint8Array.from(image.buffer)], { type: image.mimeType }), "screenshot.png");

    const response = await fetch(url, {
      method: "POST",
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

  async listLanes(boardId: string): Promise<KaitenLane[]> {
    const items = await this.request<Array<{ id: number | string; title: string }>>(
      "GET",
      ENDPOINTS.listLanes(boardId),
    );
    return items.map((item) => ({ id: String(item.id), title: item.title, boardId }));
  }
}
