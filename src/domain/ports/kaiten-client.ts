import type { TaskDraft } from "../entities/task-draft";
import type { CapturedImage } from "../entities/captured-image";

export interface KaitenSpace {
  id: string;
  title: string;
}

export interface KaitenBoard {
  id: string;
  title: string;
  spaceId: string;
}

export interface KaitenLane {
  id: string;
  title: string;
  boardId: string;
}

export interface KaitenCreatedTask {
  id: string;
  url: string;
}

/**
 * Клиент Kaiten API. Точная схема эндпоинтов/полей уточняется владельцем продукта
 * по ходу реализации — см. infrastructure/kaiten/kaiten-http-client.ts за деталями
 * и TODO-маркерами. Use-cases зависят только от этого интерфейса.
 */
export interface KaitenClient {
  createTask(draft: TaskDraft): Promise<KaitenCreatedTask>;
  attachFile(taskId: string, image: CapturedImage): Promise<void>;
  listSpaces(): Promise<KaitenSpace[]>;
  listBoards(spaceId: string): Promise<KaitenBoard[]>;
  listLanes(boardId: string): Promise<KaitenLane[]>;
}
