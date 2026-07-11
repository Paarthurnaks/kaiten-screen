import { TaskDraft, type TaskDraftInput } from "../domain/entities/task-draft";
import type { CapturedImage } from "../domain/entities/captured-image";
import type { CaptureRegion } from "../domain/value-objects/capture-region";
import type { ScreenCaptureProvider } from "../domain/ports/screen-capture-provider";
import type { KaitenClient, KaitenCreatedTask } from "../domain/ports/kaiten-client";
import type { Logger } from "../domain/ports/logger";

export interface SubmitTaskResult {
  task: KaitenCreatedTask;
  /** true, если задача создана, но вложение прикрепить не удалось (частичный успех). */
  attachmentFailed: boolean;
  /** true, если задача создана, но добавить хотя бы одного участника не удалось. */
  membersFailed: boolean;
}

/**
 * Оркестрирует ключевой сценарий: захват области экрана -> создание задачи в Kaiten
 * с прикреплённым скриншотом. Ничего не знает о конкретных реализациях портов.
 */
export class CaptureAndCreateTask {
  constructor(
    private readonly capture: ScreenCaptureProvider,
    private readonly kaiten: KaitenClient,
    private readonly logger: Logger,
  ) {}

  async captureStep(): Promise<{ region: CaptureRegion; image: CapturedImage } | null> {
    this.logger.debug("CaptureAndCreateTask.captureStep", "starting capture");
    const result = await this.capture.captureRegion();
    if (!result) {
      this.logger.debug("CaptureAndCreateTask.captureStep", "capture cancelled by user");
      return null;
    }
    this.logger.info("CaptureAndCreateTask.captureStep", "capture succeeded", {
      width: result.region.width,
      height: result.region.height,
    });
    return result;
  }

  async submitStep(
    draftInput: TaskDraftInput,
    image: CapturedImage,
    participantIds: string[] = [],
  ): Promise<SubmitTaskResult> {
    // TaskDraft.create бросает DomainValidationError при некорректных данных —
    // пусть исключение всплывает к вызывающему коду (UI показывает ошибку валидации).
    const draft = TaskDraft.create(draftInput);

    this.logger.debug("CaptureAndCreateTask.submitStep", "creating task in kaiten", {
      boardId: draft.boardId,
      laneId: draft.laneId,
    });
    const task = await this.kaiten.createTask(draft);
    this.logger.info("CaptureAndCreateTask.submitStep", "task created", { taskId: task.id });

    let membersFailed = false;
    if (participantIds.length > 0) {
      const results = await Promise.allSettled(
        participantIds.map((userId) => this.kaiten.addCardMember(task.id, userId)),
      );
      membersFailed = results.some((result) => result.status === "rejected");
      if (membersFailed) {
        this.logger.warn("CaptureAndCreateTask.submitStep", "task created but some members failed to add", {
          taskId: task.id,
        });
      } else {
        this.logger.info("CaptureAndCreateTask.submitStep", "members added", {
          taskId: task.id,
          count: participantIds.length,
        });
      }
    }

    try {
      await this.kaiten.attachFile(task.id, image);
      this.logger.info("CaptureAndCreateTask.submitStep", "attachment uploaded", { taskId: task.id });
      return { task, attachmentFailed: false, membersFailed };
    } catch (err) {
      this.logger.warn("CaptureAndCreateTask.submitStep", "task created but attachment failed", {
        taskId: task.id,
        error: String(err),
      });
      return { task, attachmentFailed: true, membersFailed };
    }
  }

  /** Прикрепляет уже захваченный скриншот к существующей карточке (экран «Прикрепить
   * к существующей»), минуя создание новой задачи. */
  async attachToExistingCard(cardId: string, image: CapturedImage): Promise<void> {
    this.logger.debug("CaptureAndCreateTask.attachToExistingCard", "attaching to existing card", { cardId });
    await this.kaiten.attachFile(cardId, image);
    this.logger.info("CaptureAndCreateTask.attachToExistingCard", "attachment uploaded", { cardId });
  }
}
