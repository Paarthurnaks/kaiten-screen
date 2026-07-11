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

export interface KaitenColumn {
  id: string;
  title: string;
  boardId: string;
}

export interface KaitenUser {
  id: string;
  fullName: string;
}

export interface KaitenCustomPropertyValue {
  id: string;
  label: string;
}

export interface KaitenCustomProperty {
  id: string;
  name: string;
  multiSelect: boolean;
  values: KaitenCustomPropertyValue[];
}

export interface KaitenSearchCard {
  id: string;
  title: string;
}

export interface KaitenCreatedTask {
  id: string;
  url: string;
}

/**
 * Клиент Kaiten API. Схема эндпоинтов подтверждена реальными ответами боевого Kaiten
 * (см. infrastructure/kaiten/kaiten-http-client.ts).
 */
export interface KaitenClient {
  createTask(draft: TaskDraft): Promise<KaitenCreatedTask>;
  attachFile(taskId: string, image: CapturedImage): Promise<void>;
  addCardMember(taskId: string, userId: string): Promise<void>;
  listSpaces(): Promise<KaitenSpace[]>;
  listBoards(spaceId: string): Promise<KaitenBoard[]>;
  listColumns(boardId: string): Promise<KaitenColumn[]>;
  listLanes(boardId: string): Promise<KaitenLane[]>;
  listUsers(): Promise<KaitenUser[]>;
  listCustomProperties(): Promise<KaitenCustomProperty[]>;
  searchCards(query: string): Promise<KaitenSearchCard[]>;
}
