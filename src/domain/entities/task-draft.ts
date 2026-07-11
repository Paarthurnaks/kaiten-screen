import { DomainValidationError } from "../errors";

export interface TaskDraftInput {
  title: string;
  description?: string;
  boardId: string;
  laneId: string;
  columnId?: string;
  responsibleId?: string;
  /** Пользовательские поля Kaiten: ключ "id_<propertyId>", значение — id варианта
   * (строка) для одиночного выбора или массив id для multiSelect-полей. */
  properties?: Record<string, string | string[]>;
}

/** Черновик задачи Kaiten, заполняемый пользователем в форме после захвата скриншота. */
export class TaskDraft {
  private constructor(
    public readonly title: string,
    public readonly boardId: string,
    public readonly laneId: string,
    public readonly description?: string,
    public readonly columnId?: string,
    public readonly responsibleId?: string,
    public readonly properties: Record<string, string | string[]> = {},
  ) {}

  static create(input: TaskDraftInput): TaskDraft {
    const title = input.title.trim();
    if (title.length === 0) {
      throw new DomainValidationError("TaskDraft: заголовок обязателен");
    }
    if (!input.boardId) {
      throw new DomainValidationError("TaskDraft: доска (boardId) обязательна");
    }
    if (!input.laneId) {
      throw new DomainValidationError("TaskDraft: дорожка (laneId) обязательна");
    }
    return new TaskDraft(
      title,
      input.boardId,
      input.laneId,
      input.description,
      input.columnId,
      input.responsibleId,
      input.properties ?? {},
    );
  }
}
